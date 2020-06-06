import { Consumer } from 'sqs-consumer';
import { SQS, config } from 'aws-sdk';
import { AWSConfig } from '../aws/config';
import { HasSubscribers, Publisher, Subscriber, Subscription, Message } from '@eventstore.net/event.store';

/**
 * A Publisher that use SQS to message communications.
 */
export class SQSPublisher implements Publisher, HasSubscribers {
    private url: string;
    private sqs: SQS;

    constructor(url: string, awsconfig: AWSConfig) {
        config.update(awsconfig.aws);
        this.sqs = new SQS();
        this.url = url;
    }

    public async publish(message: Message): Promise<boolean> {
        const sqsData = {
            MessageAttributes: {
                'aggregation': {
                    DataType: 'String',
                    StringValue: message.stream.aggregation
                },
                'commitTimestamp': {
                    DataType: 'Number',
                    StringValue: `${message.event.commitTimestamp}`
                },
                'id': {
                    DataType: 'String',
                    StringValue: message.stream.id,
                },
            },
            MessageBody: JSON.stringify(message),
            QueueUrl: this.url,
        };

        const messageId = await (await this.sqs.sendMessage(sqsData).promise()).MessageId;
        return messageId !== null && messageId !== undefined;
    }

    public async subscribe(_: string, subscriber: Subscriber): Promise<Subscription> {
        const consumer = Consumer.create({
            handleMessage: async (sqsMessage) => {
                const message: Message = JSON.parse(sqsMessage.Body);
                subscriber(message);
            },
            queueUrl: this.url,
        });

        consumer.start();

        return {
            remove: async () => consumer.stop()
        };
    }
}
