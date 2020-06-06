jest.mock('aws-sdk');

import { config, SNS } from 'aws-sdk';
import { SNSPublisher } from '../../../src/index';
import { Protocols } from '../../../src/publisher/sns';

const configUpdateMock: jest.Mock = config.update as any;
const snsStub: jest.Mock = SNS as any;
const promiseMock = jest.fn();
const sendMessageMock = jest.fn();
const subscriberMock = jest.fn();
const unsubscriberMock = jest.fn();

describe('EventStory SNS Publisher', () => {

    beforeAll(() => {
        sendMessageMock.mockReturnValue({
            promise: promiseMock
        });
        subscriberMock.mockReturnValue({
            promise: promiseMock,
        });
        unsubscriberMock.mockReturnValue({
            promise: promiseMock,
        });

        snsStub.mockReturnValue({
            publish: sendMessageMock,
            subscribe: subscriberMock,
            unsubscribe: unsubscriberMock,
        });
    });

    beforeEach(() => {
        configUpdateMock.mockClear();
        snsStub.mockClear();
        promiseMock.mockClear();
        sendMessageMock.mockClear();
        subscriberMock.mockClear();
    });

    it('should be able to publish events to sns', async () => {
        promiseMock.mockResolvedValue({
            MessageId: '12345'
        });
        const config = { aws: { region: 'any region' } };
        const snsPublisher = new SNSPublisher('http://local', config);

        const messageBody = {
            event: {
                commitTimestamp: 1234567,
                payload: 'anything',
                sequence: 1,
            },
            stream: { aggregation: 'orders', id: '1' },
        };
        const published = await snsPublisher.publish(messageBody);

        expect(configUpdateMock).toBeCalledWith(config.aws);
        expect(published).toBeTruthy();
        expect(sendMessageMock).toBeCalledWith({
            Message: JSON.stringify(messageBody),
            TopicArn: 'http://local'
        });
    });

    it('should be able to subscribe to listen changes in the eventstore', async () => {
        const snsPublisher = new SNSPublisher('http://local',
            { aws: { region: 'any region' } },
            { endpointSubscriber: 'http://localhost:3000', protocol: Protocols.HTTP, });

        const subscription = await snsPublisher.subscribe('orders', jest.fn());
        subscription.remove();

        expect(subscriberMock).toBeCalledWith({
            Endpoint: 'http://localhost:3000',
            Protocol: 'http',
            TopicArn: 'http://local'
        });
    });

    it('should be able to throw exception when sns options is undefined', async () => {
        const snsPublisher = new SNSPublisher('http://local',
            { aws: { region: 'any region' } });

        expect(async () => await snsPublisher.subscribe('orders', jest.fn())).rejects.toThrowError('SNSOption is required to subscriber');

    });

    it('should be able to throw exception when protocol does not match with endpoint subscriber', async () => {
        const snsPublisher = new SNSPublisher('http://local',
            { aws: { region: 'any region' } },
            { protocol: Protocols.HTTP, endpointSubscriber: 'https://local' });

        expect(async () => await snsPublisher.subscribe('orders', jest.fn())).rejects.toThrowError('Protocol and endpoint subscriber does not match');

    });
});