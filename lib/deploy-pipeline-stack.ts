import { SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { PipelineProject, BuildSpec, LinuxBuildImage } from "aws-cdk-lib/aws-codebuild";
import { EcsApplication, EcsDeploymentGroup, EcsDeploymentConfig } from "aws-cdk-lib/aws-codedeploy";
import { Artifact, ArtifactPath, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, CodeDeployEcsDeployAction, GitHubSourceAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { ManagedPolicy, PolicyStatement } from "aws-cdk-lib/aws-iam";
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

        const repo = Repository.fromRepositoryName(this, 'Repo', 'feed-repo');
        // Build
        const buildProject = new PipelineProject(this, 'FeedBuildProject', {
            buildSpec: BuildSpec.fromSourceFilename('infra/buildspec.yml'),
            environment: {
                buildImage: LinuxBuildImage.STANDARD_5_0,
                privileged: true
            },
            environmentVariables : {
                ACCOUNT_ID: {
                    value: this.account
                },
                ACCOUNT_REGION: {
                    value: this.region
                },
                REPOSITORY_URI : {
                    value : repo.repositoryUri
                },
            }
        });

        buildProject.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'));
        buildProject.addToRolePolicy(new PolicyStatement({
            actions: [
                'cloudformation:DescribeStackResources'
            ],
            resources: ['*']
        }));

        buildProject.addToRolePolicy(new PolicyStatement({
            actions: ["ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ],
            resources: ["*"]
        }));

        // initialize build action
        const buildArtifact = new Artifact('BuildArtifact');
        const imageDetailsArtifact = new Artifact('ImageDetails');
        const buildAction = new CodeBuildAction({
            actionName : 'Comment_CodeBuild',
            project : buildProject,
            input : sourceOutput,
            outputs : [buildArtifact, imageDetailsArtifact]
        })

        pipeline.addStage({
            stageName : 'Build',
            actions : [buildAction]
        })

        const myApplication = EcsApplication.fromEcsApplicationName(this, 'CodeDeployApplication', 'feed-ecs-application');

        // add deploy stage
        const deploymentGroup = EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(
            pipeline, 'feed-deployment-group', {
                application: myApplication,
                deploymentGroupName: 'feed-deployment-group',
                deploymentConfig: EcsDeploymentConfig.ALL_AT_ONCE,
        });

        const deployAction = new CodeDeployEcsDeployAction({
            actionName: 'Deploy',
            deploymentGroup,
            taskDefinitionTemplateFile:
                new ArtifactPath(buildArtifact, `task-definition-sample.json`),
            /**
             * Create a file named appspec.yaml with the following contents. 
             * For TaskDefinition, do not change the <TASK_DEFINITION> placeholder text. 
             * This value is updated when your pipeline runs.
             */
            appSpecTemplateFile:
                new ArtifactPath(buildArtifact, `appspec-sample.json`),
            containerImageInputs: [{
                input: imageDetailsArtifact,
                // The placeholder string in the ECS task definition template file 
                // that will be replaced with the image URI.
                taskDefinitionPlaceholder: 'PLACEHOLDER' 
            }]
        })

        pipeline.addStage({
            stageName : 'Deploy',
            actions: [deployAction]
        });
    }
}