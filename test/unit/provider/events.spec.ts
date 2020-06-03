import { EventsTable } from '../../../src/provider/events';
import { AWSDynamoConfig } from '../../../src/aws/config';
import { Stream } from '@eventstore.net/event.store/dist/model/stream';

const createTableMock = jest.fn();
const promiseCreateTableMock = jest.fn();
const promiseListTablesMock = jest.fn();
const promisePutMock = jest.fn();
const promiseQueryMock = jest.fn();
const listTablesMock = jest.fn();
const putMock = jest.fn();
const queryMock = jest.fn();
const dynamo: any = {
    createTable: createTableMock,
    listTables: listTablesMock
};
const documentClient: any = {
    put: putMock,
    query: queryMock
};

let eventsTable: EventsTable;

describe('EventsTable', () => {

    let tableConfig: AWSDynamoConfig;
    let stream: Stream;
    let dateNowSpy: jest.SpyInstance;
    const eventTimestamp = new Date('2019-04-07T10:20:30Z');

    beforeAll(() => {
        tableConfig = {
            tableName: 'mytable',
            readCapacityUnits: 2,
            writeCapacityUnits: 2
        };
        stream = { aggregation: 'myAggregation', id: 'myid' };
        dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => eventTimestamp.getTime());
    });

    afterAll(() => {
        dateNowSpy.mockRestore();
    });

    beforeEach(() => {
        promiseCreateTableMock.mockClear();
        promiseListTablesMock.mockClear();
        promisePutMock.mockClear();
        promiseQueryMock.mockClear();

        createTableMock.mockClear();
        listTablesMock.mockClear();
        putMock.mockClear();
        queryMock.mockClear();

        createTableMock.mockImplementation(() => {
            return {
                promise: promiseCreateTableMock
            };
        });

        listTablesMock.mockImplementation(() => {
            return {
                promise: promiseListTablesMock
            };
        });

        putMock.mockImplementation(() => {
            return {
                promise: promisePutMock
            };
        });

        queryMock.mockImplementation(() => {
            return {
                promise: promiseQueryMock
            };
        });

        promiseListTablesMock.mockResolvedValue({
            TableNames: [tableConfig.tableName]
        });

        eventsTable = new EventsTable(dynamo, documentClient, tableConfig);
    });

    describe('addEvent()', () => {
        it('should add a new Event', async () => {
            const commitTimestamp = eventTimestamp.getTime();
            const eventData = { data: 'my event data' };

            const event = await eventsTable.addEvent(stream, eventData);

            expect(putMock).toBeCalledWith({
                Item: {
                    // eslint-disable-next-line @typescript-eslint/camelcase
                    aggregationStreamid: `${stream.aggregation}:${stream.id}`,
                    commitTimestamp,
                    payload: eventData,
                    stream: stream
                },
                TableName: tableConfig.tableName,
            });
            expect(promisePutMock).toBeCalledTimes(1);
            expect(event).toEqual({
                commitTimestamp,
                payload: eventData
            });
        });

        it('should ensure tables exists', async () => {
            const eventData = { data: 'my event data' };

            await eventsTable.addEvent(stream, eventData);
            expect(listTablesMock).toBeCalledWith({});
            expect(promiseListTablesMock).toBeCalledTimes(1);
            expect(createTableMock).not.toBeCalled();
        });

        it('should create table when not exists', async () => {
            promiseListTablesMock.mockResolvedValue({
                TableNames: []
            });

            const eventData = { data: 'my event data' };

            await eventsTable.addEvent(stream, eventData);
            expect(listTablesMock).toBeCalledWith({});
            expect(promiseListTablesMock).toBeCalledTimes(1);
            expect(createTableMock).toBeCalledWith({
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
                    ReadCapacityUnits: tableConfig.readCapacityUnits,
                    WriteCapacityUnits: tableConfig.writeCapacityUnits
                },
                TableName: tableConfig.tableName
            });
        });

        it('should check tables only once', async () => {
            const eventData = { data: 'my event data' };

            await eventsTable.addEvent(stream, eventData);
            await eventsTable.addEvent(stream, eventData);
            expect(listTablesMock).toBeCalledTimes(1);
            expect(promiseListTablesMock).toBeCalledTimes(1);
            expect(createTableMock).not.toBeCalled();
        });
    });

    describe('getEvents()', () => {
        it('should return the events list', async () => {
            const commitTimestamp = eventTimestamp.getTime();
            const eventData = { data: 'my event data' };
            promiseQueryMock.mockResolvedValue({
                Items: [{
                    commitTimestamp: commitTimestamp,
                    payload: eventData
                },
                {
                    commitTimestamp: commitTimestamp + 1,
                    payload: eventData
                }]
            });

            const events = await eventsTable.getEvents(stream);

            expect(queryMock).toBeCalledWith({
                ExpressionAttributeValues: { ':key': `${stream.aggregation}:${stream.id}` },
                KeyConditionExpression: 'aggregationStreamid = :key',
                TableName: tableConfig.tableName
            });
            expect(promiseQueryMock).toBeCalledTimes(1);
            expect(events).toEqual([{
                commitTimestamp: commitTimestamp,
                payload: eventData,
                sequence: 1
            },
            {
                commitTimestamp: commitTimestamp + 1,
                payload: eventData,
                sequence: 2
            }]);
        });
        it('should query a range of events', async () => {
            const commitTimestamp = eventTimestamp.getTime();
            const eventData = { data: 'my event data' };
            promiseQueryMock.mockResolvedValue({
                Items: [{
                    commitTimestamp: commitTimestamp,
                    payload: eventData
                },
                {
                    commitTimestamp: commitTimestamp + 1,
                    payload: eventData
                }]
            });

            const events = await eventsTable.getEvents(stream, 'offset', 5);

            expect(queryMock).toBeCalledWith({
                ExpressionAttributeValues: { ':key': `${stream.aggregation}:${stream.id}` },
                KeyConditionExpression: 'aggregationStreamid = :key',
                TableName: tableConfig.tableName,
                ExclusiveStartKey: 'offset',
                Limit: 5
            });
            expect(promiseQueryMock).toBeCalledTimes(1);
            expect(events).toEqual([{
                commitTimestamp: commitTimestamp,
                payload: eventData,
                sequence: 1
            },
            {
                commitTimestamp: commitTimestamp + 1,
                payload: eventData,
                sequence: 2
            }]);
        });
    });
});