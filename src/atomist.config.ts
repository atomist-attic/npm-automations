import { Configuration } from "@atomist/automation-client/configuration";

import * as appRoot from "app-root-path";

import { BuildPublishStatus } from "./events/BuildPublishStatus";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot.path}/package.json`);

const token = process.env.GITHUB_TOKEN;

export const configuration: Configuration = {
    name: pj.name,
    version: pj.version,
    teamIds: ["T1L0VDKJP"],
    commands: [
    ],
    events: [
        () => new BuildPublishStatus(),
    ],
    ingestors: [
    ],
    token,
    http: {
        enabled: true,
        auth: {
            basic: {
                enabled: false,
            },
            bearer: {
                enabled: false,
            },
        },
    },
    endpoints: {
        api: "https://automation-staging.atomist.services/registration",
        graphql: "https://automation-staging.atomist.services/graphql/team",
    },
};
