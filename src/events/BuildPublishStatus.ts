/*
 * Copyright © 2017 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { subscriptionFromFile } from "@atomist/automation-client/graph/graphQL";
import { Failure, Success } from "@atomist/automation-client/HandlerResult";
import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    Secret,
    Secrets,
    Tags,
} from "@atomist/automation-client/Handlers";
import { logger } from "@atomist/automation-client/internal/util/logger";

import axios, { AxiosResponse, AxiosStatic } from "axios";

import { BuildWithRepo } from "../typings/types";

interface CommitStatusPayload {
    state: "error" | "failure" | "pending" | "success";
    target_url?: string;
    description?: string;
    context?: string;
}

interface ErrorHandlerResult extends HandlerResult {
    code: number;
    error: string;
}

function errorResult(msg: string): HandlerResult {
    const e: ErrorHandlerResult = { code: 1, error: msg };
    return e as HandlerResult;
}

interface SuccessHandlerResult extends HandlerResult {
    code: 0;
    message: string;
}

function successResult(msg: string): HandlerResult {
    const s: SuccessHandlerResult = { code: 0, message: msg };
    return s as HandlerResult;
}

@EventHandler("create commit status with NPM module URL after successful publication",
    subscriptionFromFile("graphql/build"))
@Tags("build", "npm")
export class BuildPublishStatus implements HandleEvent<BuildWithRepo.Subscription> {

    @Secret(Secrets.ORG_TOKEN)
    public githubToken: string;

    public handle(e: EventFired<BuildWithRepo.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`incoming event is %s`, JSON.stringify(e.data, null, 2));

        return postStatusToGitHub(e, this.githubToken, axios);
    }

}

/**
 * Make separate function so we can mock and test.
 */
export function postStatusToGitHub(
    e: EventFired<BuildWithRepo.Subscription>,
    token: string,
    axon: AxiosStatic,
): Promise<HandlerResult> {

    if (e && e.data && e.data.Build) {
        const axiosConfig = {
            headers: {
                "Accept": "application/vnd.github.v3+json",
                "Authorization": `token ${token}`,
                "Content-Type": "application/json",
            },
        };

        return Promise.all(e.data.Build.map(build => {
            if (build.status !== "passed") {
                return successResult(`build did not pass`);
            }
            if (!build.name || !build.repo || !build.trigger || !build.commit ||
                !build.commit.sha || !build.commit.tags) {
                return successResult(`build event does not have needed properties to post status`);
            }

            const buildName = build.name;
            const repo = build.repo;
            const slug = `${repo.owner}/${repo.name}`;
            const trigger = build.trigger;
            const commit = build.commit;
            const sha = build.commit.sha;
            const tags = build.commit.tags;
            const defaultBranch = (repo.defaultBranch) ? repo.defaultBranch : "master";
            const isPushToDefaultBranchBuild = build.trigger === "push" &&
                build.push && build.push.branch === defaultBranch;
            const isPullRequestBuild = build.trigger === "pull_request"
                && build.pullRequest && build.pullRequest.branchName;
            if (!isPushToDefaultBranchBuild && !isPullRequestBuild) {
                const msg = `build ${slug}#${buildName} is neither on default branch nor a PR`;
                logger.info(msg);
                return successResult(msg);
            }

            const ghApiBase = (repo.org && repo.org.provider && repo.org.provider.apiUrl) ?
                repo.org.provider.apiUrl : "https://api.github.com/";
            const ghPkgJsonUrl = `${ghApiBase}repos/${slug}/contents/package.json?ref=${build.commit.sha}`;
            return axon.get(ghPkgJsonUrl, axiosConfig)
                .then(pkgJsonResponse => {
                    console.log(``);
                    if (pkgJsonResponse.status === 404) {
                        logger.info(`failed to find ${slug}/package.json: ${httpErrorMsg(pkgJsonResponse)}`);
                        return successResult(`not an NPM package repository`);
                    } else if (pkgJsonResponse.status < 200 || pkgJsonResponse.status > 299) {
                        const msg = `get ${slug}/package.json failed: ${httpErrorMsg(pkgJsonResponse)}`;
                        logger.error(msg);
                        return errorResult(msg);
                    }

                    const pkgJsonContentBase64 = pkgJsonResponse.data.content;
                    const pkgJsonBuffer = new Buffer(pkgJsonContentBase64, "base64");
                    const pkgJsonContent = pkgJsonBuffer.toString();
                    const pkgJson = JSON.parse(pkgJsonContent);
                    const moduleName = pkgJson.name;
                    const moduleBaseVersion = pkgJson.version;

                    const branchName = (build.pullRequest && build.pullRequest.branchName) ?
                        build.pullRequest.branchName : undefined;
                    const ghStatusUrl = `${ghApiBase}repos/${slug}/statuses/${sha}`;
                    const artifactoryBase = "https://atomist.jfrog.io/atomist/npm-dev";
                    const moduleBase = `${artifactoryBase}/${moduleName}/-/${moduleName}`;

                    const moduleVersions = findBuildTags(tags, trigger, moduleBaseVersion,
                        buildName, "travis", branchName);

                    return Promise.all(moduleVersions.map(moduleVersion => {

                        const moduleUrl = `${moduleBase}-${moduleVersion}.tgz`;
                        const statusData: CommitStatusPayload = {
                            state: "success",
                            description: "Prerelease NPM module publication",
                            context: "npm/module/prerelease",
                            target_url: moduleUrl,
                        };

                        return axon.post(ghStatusUrl, statusData, axiosConfig)
                            .then(statusResponse => {
                                if (statusResponse.status < 200 || statusResponse.status > 299) {
                                    const msg = `failed to post to ${ghStatusUrl}: ${httpErrorMsg(statusResponse)}`;
                                    logger.error(msg);
                                    return errorResult(msg);
                                }
                                return successResult(`posted status to GitHub`);
                            })
                            .catch((err: any) =>
                                errorResult(`failed to post to ${ghStatusUrl}: ${(err as Error).message}`));
                    }))
                        .then(resolved => resolveManyToOne(resolved))
                        .catch((err: any) => errorResult((err as Error).message));
                });
        }))
            .then(resolved => resolveManyToOne(resolved))
            .catch((err: any) => errorResult((err as Error).message));
    }

    const noOpMsg = `BuildPublishStatus: build event fired but event had no build`;
    logger.warn(noOpMsg);
    return Promise.resolve(errorResult(noOpMsg));
}

/**
 * If any of the results are Failure, return a Failure with a
 * concatenation of all available error messages.
 *
 * @param results array of handler results, typically returned by Promise.all
 * @return Success if all results are Success, failure otherwise
 */
function resolveManyToOne(results: HandlerResult[]): HandlerResult {
    const failures = results.filter(r => r.code !== 0);
    if (failures.length > 0) {
        const errors = failures.filter(f => (f as any).error) as ErrorHandlerResult[];
        const msg = `processing of some events failed: ${errors.map(e => e.error).join("; ")}`;
        return errorResult(msg);
    }
    return (results.length === 1) ? results[0] : successResult(`all promises passed`);
}

function httpErrorMsg(r: AxiosResponse): string {
    return `${r.statusText}: ${JSON.stringify(r.headers)}`;
}

/**
 * Find a timestamped prerelease version tag from list of tags.
 *
 * @param tags array of tags
 * @param trigger what triggered the build, "push" or "pull_request"
 * @param version base version of package
 * @param buildName name of build
 * @param buildPlatform CI provider, e.g., "travis"
 * @param branch branch of build, only used for PR builds
 * @return array of tags, may be empty
 */
export function findBuildTags(
    tags: BuildWithRepo.Tags[],
    trigger: "push" | "pull_request",
    version: string,
    buildName: string,
    buildPlatform: string = "travis",
    branch?: string,
): string[] {

    const buildMeta = `${buildPlatform}\\.${buildName}`;
    let tagRegExp: RegExp;
    if (trigger === "push") {
        tagRegExp = new RegExp(`^${version}-\\d{14}\\+${buildMeta}\$`);
    } else if (branch) {
        const safeBranch = branch.replace(/[^A-Za-z0-9\\-]+/g, ".");
        tagRegExp = new RegExp(`^${version}-${safeBranch}\\.\\d{14}\\+${buildMeta}\$`);
    } else {
        return [];
    }

    return (tags.map(t => t.name).filter(t => !!t && tagRegExp.test(t)) as string[])
        .map(t => t && t.replace(/\+.*$/, ""));
}
