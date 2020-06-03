jest.mock('aws-sdk');
jest.mock('sqs-consumer');

import { config, SQS } from 'aws-sdk';
import { Consumer } from 'sqs-consumer';
import { SQSPublisher } from '../../../src/index';

const configUpdateMock: jest.Mock = config.update as any;
const consumerCreateMock = Consumer.create as jest.Mock;
const sqsStub: jest.Mock = SQS as any;
const promiseMock = jest.fn();
const sendMessageMock = jest.fn();
const consumerMock = {
    start: jest.fn(),
    stop: jest.fn()
};

describe('EventStory SQS Publisher', () => {

    beforeAll(() => {
        sendMessageMock.mockReturnValue({
            promise: promiseMock
        });

        sqsStub.mockReturnValue({
            sendMessage: sendMessageMock,
        });

        consumerCreateMock.mockReturnValue(consumerMock);
    });

    beforeEach(() => {
        configUpdateMock.mockClear();
        sqsStub.mockClear();
        consumerCreateMock.mockClear();
        promiseMock.mockClear();
        sendMessageMock.mockClear();
        consumerMock.start.mockClear();
        consumerMock.stop.mockClear();
    });

    it('should be able to publish events to sqs', async () => {
        promiseMock.mockResolvedValue({
            MessageId: '12345'
        });
        const config = { aws: { region: 'any region' } };
        const sqsPublisher = new SQSPublisher('http://local', config);

        const messageBody = {
            event: {
                commitTimestamp: 1234567,
                payload: 'anything',
                sequence: 1,
            },
            stream: { aggregation: 'orders', id: '1' },
        };
        const published = await sqsPublisher.publish(messageBody);

        expect(configUpdateMock).toBeCalledWith(config.aws);
        expect(published).toBeTruthy();
        expect(sendMessageMock).toBeCalledWith({
            MessageAttributes: {
                aggregation: { DataType: 'String', StringValue: 'orders' },
                commitTimestamp: { DataType: 'Number', StringValue: '1234567' },
                id: { DataType: 'String', StringValue: '1' }
            },
            MessageBody: JSON.stringify(messageBody),
            QueueUrl: 'http://local'
        });
    });

    it('should be able to subscribe to listen changes in the eventstore', async () => {
        const sqsPublisher = new SQSPublisher('http://local', { aws: { region: 'any region' } });

        const subscriberOrdersMock = jest.fn();
        const body = { a: 'body' };
        consumerCreateMock.mockImplementation((options) => {
            options.handleMessage({
                Body: JSON.stringify(body)
            });
            return consumerMock;
        });

        const subscription = await sqsPublisher.subscribe('orders', subscriberOrdersMock);
        subscription.remove();
        const consumerExpected = {
            handleMessage: expect.anything(),
            queueUrl: 'http://local',
        };
        expect(consumerCreateMock).toBeCalledTimes(1);
        expect(consumerCreateMock).toBeCalledWith(consumerExpected);
        expect(consumerMock.start).toBeCalledTimes(1);
        expect(consumerMock.stop).toBeCalledTimes(1);
        expect(subscriberOrdersMock).toBeCalledWith(body);
    });
});