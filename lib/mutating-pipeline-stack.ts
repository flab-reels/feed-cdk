import { SecretValue, Stack, StackProps, Stage, StageProps } from "aws-cdk-lib";
import { EventAction, FilterGroup, Source } from "aws-cdk-lib/aws-codebuild";
import { CodeBuildStep, CodePipeline, CodePipelineSource, ShellStep } from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import { FeedCdkStack } from "./feed-cdk-stack";

export class MutatingPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);
        
        const pipeine = new CodePipeline(this, 'MutatingPipeline', {
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

        //const feedInfra = new FeedInfraDeployStage(this, 'Deploy');
        //const deployStage = pipeine.addStage(feedInfra);
    }
}

class FeedInfraDeployStage extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, props);

        //const app = new App();
        new FeedCdkStack(this, 'FeedCdkStack');
    }
}