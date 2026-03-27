const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

// Configure AWS connection using Environment Variables
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const docClient = DynamoDBDocumentClient.from(client);

// Helper function to insert a record
async function putItem(tableName, item) {
    const params = {
        TableName: tableName,
        Item: item
    };
    try {
        await docClient.send(new PutCommand(params));
        console.log(`✅ successfully seeded item to ${tableName}`);
    } catch (err) {
        console.error(`❌ Failed to seed an item into ${tableName}:`, err.message);
        throw err; // Stop seeding if it fails so user knows exactly what went wrong.
    }
}

async function seedDatabase() {
    console.log('🚀 Starting AWS DynamoDB Seeding Process...');

    console.log(`Checking Credentials: ${process.env.AWS_ACCESS_KEY_ID ? 'Loaded' : 'Missing'}`);
    if(process.env.AWS_ACCESS_KEY_ID === 'your_aws_access_key') {
         console.error('\n🛑 ERROR: You have not added your real AWS Access Keys into your .env file yet!');
         console.error('Please put your real IAM keys into server/.env and run this seeder again.');
         process.exit(1);
    }

    try {
        // Load local JSON Data
        const dataPath = path.join(__dirname, '../models/data.json');
        const dbFallbackPath = path.join(__dirname, '../models/mockData.js');
        let dataToSeed;

        if (fs.existsSync(dataPath)) {
             dataToSeed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
             console.log('📦 Loaded active Database state from data.json');
        } else {
             dataToSeed = require(dbFallbackPath); // The fallback object if .json was never created 
             console.log('📦 Loaded initial Database state from mockData.js');
        }

        // 1. Seed Users (parkev_users)
        if (dataToSeed.users && dataToSeed.users.length > 0) {
            console.log(`\n⏳ Seeding ${dataToSeed.users.length} Users...`);
            for (let user of dataToSeed.users) {
                await putItem('parkev_users', user);
            }
        }

        // 2. Seed Slots (parkev_slots)
        if (dataToSeed.slots && dataToSeed.slots.length > 0) {
            console.log(`\n⏳ Seeding ${dataToSeed.slots.length} Parking Slots...`);
            for (let slot of dataToSeed.slots) {
                await putItem('parkev_slots', slot);
            }
        }

        // 3. Seed Bookings (parkev_bookings)
        if (dataToSeed.bookings && dataToSeed.bookings.length > 0) {
            console.log(`\n⏳ Seeding ${dataToSeed.bookings.length} Bookings...`);
            for (let booking of dataToSeed.bookings) {
                await putItem('parkev_bookings', booking);
            }
        }

        // 4. Seed Activity Log (parkev_activity)
        if (dataToSeed.activityLog && dataToSeed.activityLog.length > 0) {
            console.log(`\n⏳ Seeding ${dataToSeed.activityLog.length} Activity Logs...`);
            for (let log of dataToSeed.activityLog) {
                await putItem('parkev_activity', log);
            }
        }

        console.log('\n🎉 ALL DATA HAS BEEN SUCCESSFULLY SEEDED INTO AWS DYNAMODB!');
        console.log('You can now rewrite your backend routes to use AWS natively.');

    } catch (err) {
        console.error('\n🛑 CRITICAL ERROR DURING SEEDING:', err);
        process.exit(1);
    }
}

seedDatabase();
