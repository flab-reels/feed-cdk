#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FeedCdkStack } from '../lib/feed-cdk-stack';
import { MutatingPipelineStack } from '../lib/mutating-pipeline-stack';

const app = new cdk.App();
new MutatingPipelineStack(app, 'MutatingPipelineStack');
//new FeedCdkStack(app, 'FeedInfraStack');
