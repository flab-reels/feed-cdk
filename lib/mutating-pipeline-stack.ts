import { SecretValue, Stack, StackProps, Stage, StageProps } from "aws-cdk-lib";
import { EventAction, FilterGroup, Source } from "aws-cdk-lib/aws-codebuild";
import { CodeBuildStep, CodePipeline, CodePipelineSource, ShellStep } from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import { DeployPipelineStack } from "./deploy-pipeline-stack";
import { FeedCdkStack } from "./feed-cdk-stack";

export class MutatingPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);
        
        const pipeline = new CodePipeline(this, 'MutatingPipeline', {
            pipelineName: 'FeedMutatingPipeline',
            synth : new CodeBuildStep('SynthStep', {
                input : CodePipelineSource.gitHub('flab-reels/feed-cdk', 'main', {
                    authentication : SecretValue.secretsManager('github-pipeline'),
                }),
                installCommands: [
                    'npm install -g aws-cdk'
                ],
                commands: [
                    'npm ci',
                    'npm run build',
                    'npx cdk synth'
                ]
                }
            )
        });

        // builds vpc, ecs service, nlb, deploymentgroup
        const feedInfra = new FeedInfraDeployStage(this, 'FeedInfra', {
            stageName : 'FeedInfra'
        });

        // builds code pipeline
        const feedPipeline = new FeedPipelineStage(this, 'FeedPipeline', {
            stageName : 'FeedPipeline'
        })

        pipeline.addStage(feedInfra);
        pipeline.addStage(feedPipeline);   
    }
}

class FeedInfraDeployStage extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, props);

        //const app = new App();
        new FeedCdkStack(this, 'FeedCdkStack', {
            stackName : "FeedCdkStack"
        });
    }
}

class FeedPipelineStage extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, props);

        //const app = new App();
        new DeployPipelineStack(this, 'DeployPipelineStack', {
            stackName : "DeployPipelineStack"
        });
    }
}