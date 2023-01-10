#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FeedCdkStack } from '../lib/feed-cdk-stack';

const app = new cdk.App();
new FeedCdkStack(app, 'FeedCdkStack');
