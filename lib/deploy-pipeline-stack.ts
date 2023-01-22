import { SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { GitHubSourceAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Construct } from "constructs";

export class DeployPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // deploy pipeline
        const pipeline = new Pipeline(this, 'Pipeline', {
            pipelineName: 'feed-deploy-pipeline',
        });

        // initialize source action
        const sourceOutput = new Artifact('FeedSourceArtifact');
        const sourceAction = new GitHubSourceAction({
            actionName : 'Comment_Github_Source',
            owner : 'flab-reels',
            repo : 'feed',
            oauthToken : SecretValue.secretsManager('github-pipeline'), // A GitHub OAuth token to use for authentication.
            branch : 'main',
            output : sourceOutput
        })

        pipeline.addStage({
            stageName : 'Source',
            actions : [sourceAction]
        })

        // const repo = Repository.fromRepositoryName(this, 'Repo', 'sample-base-repo');
        // // Build
        // const buildProject = new PipelineProject(this, 'SampleBuildProject', {
        //     buildSpec: BuildSpec.fromSourceFilename('infra/buildspec.yml'),
        //     environment: {
        //         buildImage: LinuxBuildImage.STANDARD_5_0,
        //         privileged: true
        //     },
        //     environmentVariables : {
        //         ACCOUNT_ID: {
        //             value: this.account
        //         },
        //         ACCOUNT_REGION: {
        //             value: this.region
        //         },
        //         REPOSITORY_URI : {
        //             value : repo.repositoryUri
        //         },
        //     }
        // });

        // buildProject.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'));
        // buildProject.addToRolePolicy(new PolicyStatement({
        //     actions: [
        //         'cloudformation:DescribeStackResources'
        //     ],
        //     resources: ['*']
        // }));

        // buildProject.addToRolePolicy(new PolicyStatement({
        //     actions: ["ecr:GetAuthorizationToken",
        //         "ecr:BatchCheckLayerAvailability",
        //         "ecr:GetDownloadUrlForLayer",
        //         "ecr:GetRepositoryPolicy",
        //         "ecr:DescribeRepositories",
        //         "ecr:ListImages",
        //         "ecr:DescribeImages",
        //         "ecr:BatchGetImage",
        //         "ecr:InitiateLayerUpload",
        //         "ecr:UploadLayerPart",
        //         "ecr:CompleteLayerUpload",
        //         "ecr:PutImage"
        //     ],
        //     resources: ["*"]
        // }));

        // // initialize build action
        // const buildArtifact = new Artifact('BuildArtifact');
        // const imageDetailsArtifact = new Artifact('ImageDetails');
        // const buildAction = new CodeBuildAction({
        //     actionName : 'Comment_CodeBuild',
        //     project : buildProject,
        //     input : sourceOutput,
        //     outputs : [buildArtifact, imageDetailsArtifact]
        // })

        // pipeline.addStage({
        //     stageName : 'Build',
        //     actions : [buildAction]
        // })
    }
}