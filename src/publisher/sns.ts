import { SNS, config } from 'aws-sdk';
import { AWSConfig } from '../aws/config';
import { HasSubscribers, Publisher, Subscriber, Subscription, Message } from '@eventstore.net/event.store';

export interface SNSOption {
    protocol: Protocols;
    endpointSubscriber: string;
};

export enum Protocols {
    HTTP = 'http', HTTPS = 'https'
}
/**
 * A Publisher that use SQS to message communications.
 */
export class SNSPublisher implements Publisher, HasSubscribers {

    private url: string;
    private sns: SNS;
    private snsOption: SNSOption;

    constructor(url: string, awsconfig: AWSConfig, snsOptions?: SNSOption) {
        config.update(awsconfig.aws);
        this.sns = new SNS();
        this.url = url;
        this.snsOption = snsOptions;
    }

    public async publish(message: Message): Promise<boolean> {
        const snsData = {
            Message: JSON.stringify(message),
            TopicArn: this.url,
        };

        const messageId = await (await this.sns.publish(snsData).promise()).MessageId;
        return messageId !== null && messageId !== undefined;
    }

    public async subscribe(_: string, __: Subscriber): Promise<Subscription> {
        if (this.snsOption === undefined) {
            throw new Error('SNSOption is required to subscriber');
        }

        if (!this.snsOption.endpointSubscriber.match(this.snsOption.protocol + ':')) {
            throw new Error('Protocol and endpoint subscriber does not match');
        }
        const snsParams = {
            Endpoint: this.snsOption.endpointSubscriber,
            Protocol: this.snsOption.protocol,
            TopicArn: this.url,
        };

        await this.sns.subscribe(snsParams).promise();

        return Promise.resolve({
            remove: () => {
                this.sns.unsubscribe().promise();
                return Promise.resolve();
            }
        });
    }


}