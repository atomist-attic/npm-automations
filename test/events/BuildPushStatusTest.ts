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

import "mocha";
import * as assert from "power-assert";

import { EventFired } from "@atomist/automation-client/Handlers";

import { findBuildTags, postStatusToGitHub } from "../../src/events/BuildPublishStatus";
import { BuildWithRepo } from "../../src/typings/types";

import { AxiosPromise, AxiosRequestConfig, AxiosResponse, AxiosStatic } from "axios";

describe("findBuildTags", () => {

    const buildPlatform = "travis";

    it("should find a push build tag and return the version portion of it", () => {
        const v = "23.29.31";
        const prv = `${v}-37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `${prv}+${buildPlatform}.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "push", v, buildName, buildPlatform);
        assert(buildTags.length === 1);
        assert(buildTags[0] === prv);
    });

    it("should find a push build tag among a list", () => {
        const v = "23.29.31";
        const prv = `${v}-37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `1${prv}+${buildPlatform}.${buildName}` },
            { name: `${prv}+${buildPlatform}.${buildName}` },
            { name: `${prv}+${buildPlatform}.${buildName}1` },
            { name: `${prv}+circleci.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "push", v, buildName, buildPlatform);
        assert(buildTags.length === 1);
        assert(buildTags[0] === prv);
    });

    it("should find a push build tags among a list", () => {
        const v = "23.29.31";
        const tss = ["37414347535961", "41434753596171", "43475359617173"];
        const prvs = tss.map(t => `${v}-${t}`);
        const buildName = "79";
        const tags: BuildWithRepo.Tags[] = [
            { name: `1${prvs[0]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[0]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[1]}+${buildPlatform}.${buildName}1` },
            { name: `${prvs[1]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[2]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[2]}+circleci.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "push", v, buildName, buildPlatform);
        assert(buildTags.length === prvs.length);
        prvs.forEach((bv, i) => assert(buildTags[i] === bv));
    });

    it("should not find a push build tag if one does not exist", () => {
        const v = "23.29.31";
        const prv = `${v}-37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `1${prv}+${buildPlatform}.${buildName}` },
            { name: `${prv}+${buildPlatform}.${buildName}1` },
            { name: `${prv}+circleci.${buildName}1` },
            { name: `${prv}-branch+${buildPlatform}.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "push", v, buildName, buildPlatform);
        assert(buildTags.length === 0);
    });

    it("should find a PR build tag and return the version portion of it", () => {
        const v = "23.29.31";
        const branch = "prime-movers";
        const prv = `${v}-${branch}.37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `${prv}+${buildPlatform}.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "pull_request", v, buildName, buildPlatform, branch);
        assert(buildTags.length === 1);
        assert(buildTags[0] === prv);
    });

    it("should find a PR build tag using safe branch name", () => {
        const v = "23.29.31";
        const badBranch = "pr1me_.mov3rs-+1";
        const branch = "pr1me.mov3rs-.1";
        const prv = `${v}-${branch}.37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `${prv}+${buildPlatform}.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "pull_request", v, buildName, buildPlatform, badBranch);
        assert(buildTags.length === 1);
        assert(buildTags[0] === prv);
    });

    it("should find a PR build tag among a list", () => {
        const v = "23.29.31";
        const branch = "prime-movers";
        const prv = `${v}-${branch}.37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `1${prv}+${buildPlatform}.${buildName}` },
            { name: `${prv}+${buildPlatform}.${buildName}` },
            { name: `${prv}+${buildPlatform}.${buildName}1` },
            { name: `${prv}+circleci.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "pull_request", v, buildName, buildPlatform, branch);
        assert(buildTags.length === 1);
        assert(buildTags[0] === prv);
    });

    it("should find a PR build tags among a list", () => {
        const v = "23.29.31";
        const branch = "prime-movers";
        const tss = ["37414347535961", "41434753596171", "43475359617173"];
        const prvs = tss.map(t => `${v}-${branch}.${t}`);
        const buildName = "79";
        const tags: BuildWithRepo.Tags[] = [
            { name: `1${prvs[0]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[0]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[1]}+${buildPlatform}.${buildName}1` },
            { name: `${prvs[1]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[2]}+${buildPlatform}.${buildName}` },
            { name: `${prvs[2]}+circleci.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "pull_request", v, buildName, buildPlatform, branch);
        assert(buildTags.length === prvs.length);
        prvs.forEach((bv, i) => assert(buildTags[i] === bv));
    });

    it("should find not a PR build tag if no branch given", () => {
        const v = "23.29.31";
        const branch = "prime-movers";
        const prv = `${v}-${branch}.37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `${prv}+${buildPlatform}.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "pull_request", v, buildName, buildPlatform);
        assert(buildTags.length === 0);
    });

    it("should not find a PR build tag if one does not exist", () => {
        const v = "23.29.31";
        const branch = "prime-movers";
        const prv = `${v}-${branch}.37414347535961`;
        const buildName = "67";
        const tags: BuildWithRepo.Tags[] = [
            { name: `1${prv}+${buildPlatform}.${buildName}` },
            { name: `${prv}+${buildPlatform}.${buildName}1` },
            { name: `${prv}+circleci.${buildName}1` },
            { name: `${prv}-branch+${buildPlatform}.${buildName}` },
        ];
        const buildTags = findBuildTags(tags, "pull_request", v, buildName, buildPlatform, branch);
        assert(buildTags.length === 0);
    });

});

describe("postStatusToGitHub", () => {

    /* tslint:disable:max-line-length */
    const getPkgJsonResponse = {
        name: "package.json",
        path: "package.json",
        sha: "8a0a4a41f5297e10290045fd102a01013dd82040",
        size: 1621,
        url: "https://api.github.com/repos/atomist/slack-messages/contents/package.json?ref=ac5de03114a51fba54f39143be49ea37e075faec",
        html_url: "https://github.com/atomist/slack-messages/blob/ac5de03114a51fba54f39143be49ea37e075faec/package.json",
        git_url: "https://api.github.com/repos/atomist/slack-messages/git/blobs/8a0a4a41f5297e10290045fd102a01013dd82040",
        download_url: "https://raw.githubusercontent.com/atomist/slack-messages/ac5de03114a51fba54f39143be49ea37e075faec/package.json",
        type: "file",
        content: "ewogICJuYW1lIjogIkBhdG9taXN0L3NsYWNrLW1lc3NhZ2VzIiwKICAiZGVz\nY3JpcHRpb24iOiAidXRpbGl0aWVzIGZvciBjcmVhdGluZyBTbGFjayBtZXNz\nYWdlcyIsCiAgInZlcnNpb24iOiAiMC4xMi4wIiwKICAiYXV0aG9yIjogIkF0\nb21pc3QiLAogICJsaWNlbnNlIjogIkFwYWNoZS0yLjAiLAogICJob21lcGFn\nZSI6ICJodHRwczovL2dpdGh1Yi5jb20vYXRvbWlzdC9zbGFjay1tZXNzYWdl\ncyNyZWFkbWUiLAogICJyZXBvc2l0b3J5IjogewogICAgInR5cGUiOiAiZ2l0\nIiwKICAgICJ1cmwiOiAiZ2l0K2h0dHBzOi8vZ2l0aHViLmNvbS9hdG9taXN0\nL3NsYWNrLW1lc3NhZ2VzLmdpdCIKICB9LAogICJrZXl3b3JkcyI6IFsKICAg\nICJhdG9taXN0IiwKICAgICJydWciLAogICAgInNsYWNrIgogIF0sCiAgImJ1\nZ3MiOiB7CiAgICAidXJsIjogImh0dHBzOi8vZ2l0aHViLmNvbS9hdG9taXN0\nL3NsYWNrLW1lc3NhZ2VzL2lzc3VlcyIKICB9LAogICJkZXBlbmRlbmNpZXMi\nOiB7CiAgICAiZGVwcmVjYXRlZC1kZWNvcmF0b3IiOiAiXjAuMS42IiwKICAg\nICJsb2Rhc2giOiAiXjQuMTcuNCIKICB9LAogICJkZXZEZXBlbmRlbmNpZXMi\nOiB7CiAgICAiQHR5cGVzL2xvZGFzaCI6ICJeNC4xNC43MyIsCiAgICAiQHR5\ncGVzL21vY2hhIjogIl4yLjIuNDEiLAogICAgIkB0eXBlcy9wb3dlci1hc3Nl\ncnQiOiAiXjEuNC4yOSIsCiAgICAiZXNwb3dlci10eXBlc2NyaXB0IjogIl44\nLjAuMCIsCiAgICAibW9jaGEiOiAiXjMuNC4yIiwKICAgICJwb3dlci1hc3Nl\ncnQiOiAiXjEuNC40IiwKICAgICJzdXBlcnZpc29yIjogIl4wLjEyLjAiLAog\nICAgInRzbGludCI6ICJeNS42LjAiLAogICAgInR5cGVkb2MiOiAiXjAuOC4w\nIiwKICAgICJ0eXBlc2NyaXB0IjogIl4yLjUuMSIsCiAgICAidHlwZXNjcmlw\ndC1mb3JtYXR0ZXIiOiAiXjYuMC4wIgogIH0sCiAgImRpcmVjdG9yaWVzIjog\newogICAgInRlc3QiOiAidGVzdCIKICB9LAogICJzY3JpcHRzIjogewogICAg\nImF1dG90ZXN0IjogInN1cGVydmlzb3IgLXEgLW4gZXhpdCAteCBucG0gLS0g\ndGVzdCIsCiAgICAiYnVpbGQiOiAibnBtIHJ1biBsaW50ICYmIG5wbSBydW4g\nY29tcGlsZSAmJiBucG0gdGVzdCIsCiAgICAiY2xlYW4iOiAibnBtIHJ1biBj\nbGVhbi1qcyA7IHJtIC1yZiBidWlsZCIsCiAgICAiY2xlYW4tanMiOiAiZmlu\nZCBzcmMgdGVzdCAtdHlwZSBmIC1uYW1lICcqLmpzJyAtcHJpbnQwIHwgeGFy\nZ3MgLTAgcm0gLWYiLAogICAgImNvbXBpbGUiOiAidHNjIC1wIC4iLAogICAg\nImRpc3RjbGVhbiI6ICJucG0gcnVuIGNsZWFuIDsgcm0gLXJmIG5vZGVfbW9k\ndWxlcyIsCiAgICAiZm10IjogInRzZm10IC0tcmVwbGFjZSIsCiAgICAibGlu\ndCI6ICJ0c2xpbnQgLS1mb3JtYXQgdmVyYm9zZSAtLXByb2plY3QgLiAtLWV4\nY2x1ZGUgJ3tidWlsZCxub2RlX21vZHVsZXN9LyoqJyAnKiovKi50cyciLAog\nICAgImxpbnQtZml4IjogIm5wbSBydW4gbGludCAtLSAtLWZpeCIsCiAgICAi\ndGVzdCI6ICJtb2NoYSAtLWNvbXBpbGVycyB0czplc3Bvd2VyLXR5cGVzY3Jp\ncHQvZ3Vlc3MgJ3Rlc3QvKiovKi50cyciLAogICAgInR5cGVkb2MiOiAidHlw\nZWRvYyAtLW1vZGUgbW9kdWxlcyAtLWV4Y2x1ZGVFeHRlcm5hbHMiCiAgfQp9\nCg==\n",
        encoding: "base64",
        _links: {
            self: "https://api.github.com/repos/atomist/slack-messages/contents/package.json?ref=ac5de03114a51fba54f39143be49ea37e075faec",
            git: "https://api.github.com/repos/atomist/slack-messages/git/blobs/8a0a4a41f5297e10290045fd102a01013dd82040",
            html: "https://github.com/atomist/slack-messages/blob/ac5de03114a51fba54f39143be49ea37e075faec/package.json",
        },
    };
    const pkgJson = {
        name: "@atomist/slack-messages",
        description: "utilities for creating Slack messages",
        version: "0.12.0",
        author: "Atomist",
        license: "Apache-2.0",
        homepage: "https://github.com/atomist/slack-messages#readme",
        repository: {
            type: "git",
            url: "git+https://github.com/atomist/slack-messages.git",
        },
        keywords: [
            "atomist",
            "rug",
            "slack",
        ],
        bugs: {
            url: "https://github.com/atomist/slack-messages/issues",
        },
        dependencies: {
            "deprecated-decorator": "^0.1.6",
            "lodash": "^4.17.4",
        },
        devDependencies: {
            "@types/lodash": "^4.14.73",
            "@types/mocha": "^2.2.41",
            "@types/power-assert": "^1.4.29",
            "espower-typescript": "^8.0.0",
            "mocha": "^3.4.2",
            "power-assert": "^1.4.4",
            "supervisor": "^0.12.0",
            "tslint": "^5.6.0",
            "typedoc": "^0.8.0",
            "typescript": "^2.5.1",
            "typescript-formatter": "^6.0.0",
        },
        directories: {
            test: "test",
        },
        scripts: {
            "autotest": "supervisor -q -n exit -x npm -- test",
            "build": "npm run lint && npm run compile && npm test",
            "clean": "npm run clean-js ; rm -rf build",
            "clean-js": "find src test -type f -name '*.js' -print0 | xargs -0 rm -f",
            "compile": "tsc -p .",
            "distclean": "npm run clean ; rm -rf node_modules",
            "fmt": "tsfmt --replace",
            "lint": "tslint --format verbose --project . --exclude '{build,node_modules}/**' '**/*.ts'",
            "lint-fix": "npm run lint -- --fix",
            "test": "mocha --compilers ts:espower-typescript/guess 'test/**/*.ts'",
            "typedoc": "typedoc --mode modules --excludeExternals",
        },
    };

    const buildEvent = {
        data: {
            Build: [
                {
                    push: {
                        branch: "master",
                    },
                    pullRequestNumber: undefined,
                    name: "1190",
                    pullRequest: undefined,
                    status: "passed",
                    commit: {
                        sha: "ad31a1182a194c09b960d75b0f4002be1bbca288",
                        statuses: [
                            {
                                context: "fingerprint/atomist",
                                description: "No blocking Fingerprint changes",
                                targetUrl: "",
                            },
                            {
                                context: "continuous-integration/travis-ci/push",
                                description: "The Travis CI build failed",
                                targetUrl: "https://travis-ci.org/atomist/slack-messages/builds/280762398?utm_source=github_status&utm_medium=notification",
                            },
                        ],
                        tags: [
                            {
                                name: "0.12.0-20171006123456+travis.1190",
                            },
                        ],
                        author: {
                            login: "cdupuis",
                            person: {
                                chatId: {
                                    screenName: "cd",
                                    userId: "U1L22E3SA",
                                },
                            },
                        },
                    },
                    repo: {
                        owner: "atomist",
                        name: "slack-messages",
                        defaultBranch: "master",
                        channels: [
                            {
                                name: "slack-messages",
                            },
                        ],
                        org: {
                            provider: undefined,
                        },
                    },
                    buildUrl: "https://travis-ci.org/atomist/slack-messages/builds/280762398",
                    buildId: "280762398",
                    trigger: "push",
                    provider: "travis",
                },
            ],
        },
        extensions: {
            type: "READ_ONLY",
            operationName: "BuildWithRepo",
        },
    } as EventFired<BuildWithRepo.Subscription>;

    function fakeAxios(getStatus: number = 200, postStatus: number = 200): AxiosStatic {
        return {
            get(url: string, config?: AxiosRequestConfig): AxiosPromise {
                const ar = {
                    status: getStatus,
                    data: getPkgJsonResponse,
                    statusText: "Status Text",
                    headers: { header: "Header" },
                } as AxiosResponse;
                return Promise.resolve(ar);
            },
            post(url: string, data?: any, config?: AxiosRequestConfig): AxiosPromise {
                const ar = {
                    status: postStatus,
                    data: getPkgJsonResponse,
                    statusText: "Status Text",
                    headers: { header: "Header" },
                } as AxiosResponse;
                return Promise.resolve(ar);
            },
        } as AxiosStatic;
    }

    it("should be successful", done => {
        const promise = postStatusToGitHub(buildEvent, "dummy-token", fakeAxios());
        promise.then(result => {
            assert(result.code === 0);
            assert((result as any).message === "posted status to GitHub");
            done();
        }).catch(done);
    });

    it("should fail when getting package.json errors", done => {
        const promise = postStatusToGitHub(buildEvent, "dummy-token", fakeAxios(500));
        promise.then(result => {
            assert(result.code === 1);
            assert((result as any).error.indexOf("get atomist/slack-messages/package.json failed") > 0);
            done();
        }).catch(done);
    });

    it("should succeed when there is no package.json", done => {
        const promise = postStatusToGitHub(buildEvent, "dummy-token", fakeAxios(404));
        promise.then(result => {
            assert(result.code === 0);
            assert((result as any).message === "not an NPM package repository");
            done();
        }).catch(done);
    });

    it("should fail when posting the status fails", done => {
        const promise = postStatusToGitHub(buildEvent, "dummy-token", fakeAxios(200, 500));
        promise.then(result => {
            assert(result.code === 1);
            assert((result as any).error.indexOf("failed to post to https://api.github.com/repos") > 0);
            done();
        }).catch(done);
    });

});
