import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { EcsApplication, EcsDeploymentConfig, EcsDeploymentGroup } from 'aws-cdk-lib/aws-codedeploy';
import { CodeDeployEcsDeployAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { FlowLog, FlowLogDestination, FlowLogResourceType, GatewayVpcEndpointAwsService, InterfaceVpcEndpoint, InterfaceVpcEndpointAwsService, Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AwsLogDriver, AwsLogDriverMode, Cluster, ContainerImage, DeploymentControllerType, FargateService, FargateTaskDefinition, PropagatedTagSource } from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancer, NetworkTargetGroup, Protocol, TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class FeedCdkStack extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props);

		// create new vpc
		const vpc = new Vpc(this, 'feed-vpc', {
			vpcName : "feed-vpc",
			maxAzs : 2,
			natGateways : 0
		})

		const cluster = new Cluster(this, "feed-cluster", {
			clusterName : 'feed-cluster',
			vpc: vpc
		});

		// create vpc endpoints for ecr
		vpc.addInterfaceEndpoint('ecr-endpoint', {
			service : InterfaceVpcEndpointAwsService.ECR,
			privateDnsEnabled : true,
		})

		vpc.addInterfaceEndpoint('dkr-endpoint', {
			service : InterfaceVpcEndpointAwsService.ECR_DOCKER,
			privateDnsEnabled : true,
		})

		// cloudwatch
		vpc.addInterfaceEndpoint('awslog', {
			service : InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
			privateDnsEnabled : true
		})

		// add s3 gateway since ECR uses s3 to store images
		vpc.addGatewayEndpoint('s3-endpoint', {
			service : GatewayVpcEndpointAwsService.S3
		})

		vpc.addInterfaceEndpoint('nlb-endpoint', {
			service : InterfaceVpcEndpointAwsService.ELASTIC_LOAD_BALANCING,
			privateDnsEnabled : true
		})
		
		const nlb = new NetworkLoadBalancer(this, 'feed-nlb', {
			loadBalancerName : 'feed-nlb',
			vpc,
			internetFacing: false
		})

		const tg1 = new NetworkTargetGroup(this, 'feed-tg-blue', {
			targetGroupName : 'feed-tg-blue',
			port : 80,
			protocol : Protocol.TCP,
			vpc : vpc,
			targetType : TargetType.IP,
			healthCheck : {
                protocol:Protocol.TCP,
                port:"8080"
            }
		})

		const tg2 = new NetworkTargetGroup(this, 'feed-tg-green', {
			targetGroupName : 'feed-tg-green',
			port : 80,
			protocol : Protocol.TCP,
			vpc : vpc,
			targetType : TargetType.IP,
			healthCheck : {
                protocol:Protocol.TCP,
                port:"8080"
            }
		})

		// Listeners:
		// CodeDeploy will shift traffic from blue to green and vice-versa
		// in both the production and test listeners.
		// The production listener is used for normal, production traffic.
		// The test listener is used for test traffic, like integration tests
		// which can run as part of a CodeDeploy lifecycle event hook prior to
		// traffic being shifted in the production listener.
		// Both listeners initially point towards the blue target group.
		const listener = nlb.addListener('feed-prod-listener', {
			port : 80,
			protocol : Protocol.TCP,
			defaultTargetGroups : [tg1]
		})

		let testListener = nlb.addListener('feed-test-listener', {
			port : 8080,
			protocol : Protocol.TCP,
			defaultTargetGroups : [tg2]
		})

		// ECS Resources: task definition, service, task set, etc
		// The CodeDeploy blue-green hook will take care of orchestrating the sequence of steps
		// that CloudFormation takes during the deployment: the creation of the 'green' task set,
		// shifting traffic to the new task set, and draining/deleting the 'blue' task set.
		// The 'blue' task set is initially provisioned, pointing to the 'blue' target group.

		// initialize repository
		// Lookup existing resources
		const repo = Repository.fromRepositoryName(this, 'Feed-Repo', 'feed-repo');
		
		// create security group
		const service_sg = new SecurityGroup(this, 'feed-sg', {
			securityGroupName : 'feed-sg',
			description: 'Security group for feed service',
			vpc: cluster.vpc,
		});

		service_sg.addIngressRule(Peer.anyIpv4(), Port.tcp(80));
		service_sg.addIngressRule(Peer.anyIpv4(), Port.tcp(8080));

		// this will create placeholder taskdefinition
		const taskDefinition = new FargateTaskDefinition(this, 'feed-task-definition', {
			family : "feed-task-definition",
			memoryLimitMiB: 512,
			cpu: 256,
		});

		const taskExecutionRole = new Role(this, 'feedTaskExecRole', {
			assumedBy : new ServicePrincipal('ecs-tasks.amazonaws.com')
		})

		taskExecutionRole.addToPolicy(
			new PolicyStatement({
				effect: Effect.ALLOW,
				resources: ['*'],
				actions: [
					'ecr:GetAuthorizationToken',
					'ecr:BatchCheckLayerAvailability',
					'ecr:GetDownloadUrlForLayer',
					'ecr:BatchGetImage',
					'logs:CreateLogStream',
					'logs:PutLogEvents'
				]
			})
		)

		const myLogGroup = new LogGroup(this, 'feed-log-group', {
			logGroupName : 'feed-log-group'	
		})
		
		taskDefinition.addContainer('feed-container', {
			containerName: "feed-container",
			image: ContainerImage.fromEcrRepository(repo, 'starter'),
			portMappings :[{
				containerPort : 8080,
				hostPort :8080
			}],
			logging : new AwsLogDriver({
				streamPrefix: 'feed-service',
				logGroup : myLogGroup,
				mode: AwsLogDriverMode.NON_BLOCKING
			})
		});

	
		const service = new FargateService(this, 'feed-service', {
			serviceName: "feed-service",
			cluster,
			taskDefinition,
			securityGroups: [service_sg],
			desiredCount: 1,
			assignPublicIp : false,
			deploymentController: {
			type: DeploymentControllerType.CODE_DEPLOY,
			},
			propagateTags: PropagatedTagSource.SERVICE,
		});
		service.attachToNetworkTargetGroup(tg1);
	


		// const ecsApplication = codedeploy.EcsApplication.fromEcsApplicationName(
		//     this,
		//     'App',
		//     Fn.importValue(props.infrastructureStackName + 'CodeDeployApplication'),
		// );

		// code deploy application
		const ecsApplication = new EcsApplication(this, "feed-ecs-application", {
			applicationName : 'feed-ecs-application'
		});

		const group = new EcsDeploymentGroup(this, 'feed-deployment-group', {
			application: ecsApplication,
			deploymentGroupName: 'feed-deployment-group',
			deploymentConfig : EcsDeploymentConfig.ALL_AT_ONCE,
			service,
			blueGreenDeploymentConfig: {
				blueTargetGroup: tg1,
				greenTargetGroup: tg2,
				listener: listener,
				testListener : testListener
			},
			autoRollback: {
				stoppedDeployment: true,
			}
		});
	}
}
