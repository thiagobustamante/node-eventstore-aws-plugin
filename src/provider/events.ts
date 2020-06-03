import AWS = require('aws-sdk');
import { DocumentClient, ItemList } from 'aws-sdk/clients/dynamodb';
import * as _ from 'lodash';
import { AWSDynamoConfig } from '../aws/config';
import { DynamoDBTable } from './dynamo-table';
import { Stream } from '@eventstore.net/event.store/dist/model/stream';
import { Event } from '@eventstore.net/event.store';

export class EventsTable extends DynamoDBTable {

    private static getConfig(tableConfig: AWSDynamoConfig) {
        return _.defaults(tableConfig || {}, {
            readCapacityUnits: 1,
            tableName: 'events',
            writeCapacityUnits: 1
        });
    }

    constructor(dynamo: AWS.DynamoDB, documentClient: DocumentClient, tableConfig: AWSDynamoConfig) {
        super(dynamo, documentClient, EventsTable.getConfig(tableConfig));
    }

    public async addEvent(stream: Stream, data: any): Promise<Event> {
        await this.ensureTables();
        const commitTimestamp = Date.now();
        const event = {
            aggregationStreamid: this.getKey(stream),
            commitTimestamp: commitTimestamp,
            payload: data,
            stream: stream
        };
        const record = {
            Item: event,
            TableName: this.getTableName(),
        };

        await this.documentClient.put(record).promise();

        return {
            commitTimestamp: commitTimestamp,
            payload: data,
        } as Event;
    }

    public async getEvents(stream: Stream, offset?: string, limit?: number): Promise<Array<Event>> {
        await this.ensureTables();
        const filter: any = {
            ExpressionAttributeValues: { ':key': this.getKey(stream) },
            KeyConditionExpression: 'aggregationStreamid = :key',
            TableName: this.getTableName()
        };
        if (offset) {
            filter.ExclusiveStartKey = offset;
        }
        if (limit) {
            filter.Limit = limit;
        }

        const items: ItemList = (await this.documentClient.query(filter).promise()).Items;

        return items.map((data, index) => {
            return {
                commitTimestamp: data.commitTimestamp,
                payload: data.payload,
                sequence: index + 1,
            } as Event;
        });
    }

    protected scheme() {
        return {
            AttributeDefinitions: [
                {
                    AttributeName: 'aggregationStreamid',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'commitTimestamp',
                    AttributeType: 'N'
                }
            ],
            KeySchema: [
                {
                    AttributeName: 'aggregationStreamid',
                    KeyType: 'HASH',
                },
                {
                    AttributeName: 'commitTimestamp',
                    KeyType: 'RANGE'
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: this.getReadCapacityUnits(),
                WriteCapacityUnits: this.getWriteCapacityUnits()
            },
            TableName: this.getTableName()
        };
    }

    private getKey(stream: Stream): string {
        return `${stream.aggregation}:${stream.id}`;
    }
}