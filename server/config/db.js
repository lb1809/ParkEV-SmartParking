/**
 * ParkEV - Database Configuration
 * AWS DynamoDB client initialization with local mock fallback
 */

require('dotenv').config();

let dynamoClient = null;

function initDynamo() {
    if (process.env.USE_MOCK_DATA === 'true') {
        console.log('📦 Using in-memory mock data store (DynamoDB disabled)');
        return null;
    }

    try {
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

        const client = new DynamoDBClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });

        dynamoClient = DynamoDBDocumentClient.from(client);
        console.log('☁️  Connected to AWS DynamoDB (Region:', process.env.AWS_REGION, ')');
        return dynamoClient;
    } catch (err) {
        console.error('❌ DynamoDB connection failed:', err.message);
        console.log('📦 Falling back to in-memory mock data store');
        return null;
    }
}

function getDynamo() {
    return dynamoClient;
}

module.exports = { initDynamo, getDynamo };
