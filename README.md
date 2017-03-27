# lrs-sqs-poller

The LRS poller application polls the SQS queues which are set up to accept incoming xAPI and Caliper statements. These messages are processed and suitable Lambda workers are invoked to handle and ingest the requests into Cloud LRS.  

# Elastic Beanstalk deployment

## Install aws cli and eb cli.

```
brew install awscli
or
pip install awscli
```

For more information on installations refer this link:
http://docs.aws.amazon.com/cli/latest/userguide/installing.html#install-bundle-other-os

## Configure aws credentials

```
aws configure
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-east-1
Default output format [None]: ENTER
```

## Install eb cli

The Elastic Beanstalk Command Line Interface (EB CLI) is a command line client that you can use to create, configure, and manage Elastic Beanstalk environments. The EB CLI is developed in Python and requires Python version 2.7, version 3.4, or newer.

```
brew install python
pip install --upgrade pip
pip install --upgrade --user awsebcli
```

eb is installed to the Python bin directory; add it to your path.

```
export PATH=~/Library/Python/2.7/bin:$PATH
```

For more detais on install eb refer:
http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-install.html

## Deploying your application to Elastic Beanstalk via eb cli

1. Open the terminal and go to your node application folder
2. Run eb init to initialize the beanstalk application. For fresh environments the following prompts will appear
    - Default Region - This will be the EC2 location for the application. Choose the nearest one
    - AWS Security credentials
    - EB Application Name (Eg: lrs-sqs-poller)
    - Choice of Programming Language/Framework that your application will be using. In our case Node.js
3. Use eb create to create new environments like dev, prod, qa etc. Be sure to specify EB_ENVIRONMENT variable with the environment name.
4. The .ebextension folder contains all the custom configurations required to run the lrs-sqs-poller application on the environment.
4. This should deploy the lrs-sqs-poller application to Elastic Beanstalk.
5. For subsequent deploys to push local changes use eb deploy.
6. To terminate the environments use eb terminate.

```
eb init
eb create lrs-sqs-poller-dev --envvars EB_ENVIRONMENT=lrs-sqs-poller-dev
eb deploy
eb terminate
```

For the full list of EB CLI commands:
https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb3-cmd-commands.html
