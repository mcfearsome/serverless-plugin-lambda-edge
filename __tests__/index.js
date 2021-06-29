const UpdateLambdaFunctionAssociationPlugin = require('../src/index.js')
const Serverless = require('serverless');
class StubService {
  constructor(provider) {
    this.provider = provider
    this.custom = {
      cloudFrontId: 'XXXX',
      cacheBehaviors: ['default','/categories/*']
    }
    this.functions = {
      functionName1: {
        name: 'function-name-1',
        eventType: 'viewer-request'
      },
      functionName2: {
        name: 'function-name-2',
        eventType: 'origin-request'
      }
    }
  }
}

const lambdaListVersionsByFunction = (functionName) => ({
  NextMarker: null,
  Versions: [
    {
      FunctionName: functionName,
      FunctionArn: `arn:aws:lambda:us-east-1:000:function:${functionName}:$LATEST`,
      Version: '$LATEST',
    },
    {
      FunctionName: 'promotion-lp-lambda-edge-redirection',
      FunctionArn: `arn:aws:lambda:us-east-1:000:function:${functionName}:1`,
      Version: '1',
    },
    {
      FunctionName: 'promotion-lp-lambda-edge-redirection',
      FunctionArn: `arn:aws:lambda:us-east-1:000:function:${functionName}:2`,
      Version: '2',
    },
    {
      FunctionName: 'promotion-lp-lambda-edge-redirection',
      FunctionArn: `arn:aws:lambda:us-east-1:000:function:${functionName}:3`,
      Version: '3',
    }
  ]
});

const emptyAwsArray = {
  "Quantity": 0,
  "Items": []
}
const cloudFrontDistributionConfigRequest = (id) => ({
  "DistributionConfig": {
    "CallerReference": "1601315603257",
    "DefaultCacheBehavior": {
        "LambdaFunctionAssociations": Object.assign({}, emptyAwsArray)
    },
    "CacheBehaviors": {
        "Quantity": 2,
        "Items": [  
            {
                "PathPattern": "/categories/*",
                "LambdaFunctionAssociations": Object.assign({}, emptyAwsArray)
            },
            {
                "PathPattern": "/products/*",
                "LambdaFunctionAssociations": Object.assign({}, emptyAwsArray)
            }
        ]
    }
  }
});

const isLambdaListVersionsByFunction = (service, method, params, options) => {
  return service.toLowerCase() === 'lambda' &&
    method === 'listVersionsByFunction' &&
    'FunctionName' in params
}

const isCloudFrontDistributionConfigRequest = (service, method, params, options) => {
  return service.toLowerCase() === 'cloudfront' &&
    method === 'getDistributionConfig' &&
    'Id' in params
}

const isCloudFrontUdateDistributionRequest = (service, method, params, options) => {
  return service.toLowerCase() === 'cloudfront' &&
    method === 'updateDistribution'
}

class StubProvider {
  constructor() {
    this.name = 'aws'
    this.distributionConfig = {}
  }
  request(service, method, params, options) {
    if (isLambdaListVersionsByFunction(service, method, params, options)) {
      return lambdaListVersionsByFunction(params.FunctionName)
    }
    if (isCloudFrontDistributionConfigRequest(service, method, params, options)) {
      return cloudFrontDistributionConfigRequest(params.Id)
    }
    if (isCloudFrontUdateDistributionRequest(service, method, params, options)) {
      this.distributionConfig = params
      return params
    }
  }
}

class StubServerless {
  constructor() {
    this.provider = new StubProvider()
    this.service = new StubService(this.provider)
    const s = new Serverless({})
    s.configSchemaHandler.serverless = this;
    this.configSchemaHandler = s.configSchemaHandler;
    this.cli = {
      log: function(msg) {
        console.log(msg)
      }
    }
  }

  getProvider(_) {
    return this.provider
  }

  getDistributionConfig(_) {
    return this.provider.distributionConfig;
  }
}

describe('update lambda function association plugin', () => {
  const stubServerless = new StubServerless()
  const plugin = new UpdateLambdaFunctionAssociationPlugin(stubServerless, {})
  const lambdaConfig = [
    {
      EventType: 'viewer-request',
      LambdaFunctionARN: 'arn:aws:lambda:us-east-1:000:function:function-name-1:3',
      IncludeBody: false
    },
    {
      EventType: 'origin-request',
      LambdaFunctionARN: 'arn:aws:lambda:us-east-1:000:function:function-name-2:3',
      IncludeBody: false
    }
  ]
  it('should contain cloudFrontId', () => {
    expect(plugin.custom).toMatchObject({ cloudFrontId: 'XXXX' })
  })

  it('should contain functions', () => {
    expect(plugin.functions).toMatchObject({
      functionName1: {
        name: 'function-name-1',
        eventType: 'viewer-request'
      },
      functionName2: {
        name: 'function-name-2',
        eventType: 'origin-request'
      }
    })
  })

  it('updates the distribution config correctly', async () => {
    await plugin.updateLambdaFunctionAssociations.bind(plugin)()
    const config = stubServerless.getDistributionConfig().DistributionConfig
    expect(config.DefaultCacheBehavior.LambdaFunctionAssociations.Items).toMatchObject(lambdaConfig)
    expect(config.CacheBehaviors.Items[0].LambdaFunctionAssociations.Items).toMatchObject(lambdaConfig)
    expect(config.CacheBehaviors.Items[1].LambdaFunctionAssociations).toMatchObject(emptyAwsArray)
  })

  test('getUpdatedLambdaAssociationConfigs', async () => {

    const lambdaAssociationConfigItem = await plugin.getUpdatedLambdaAssociationConfigItems()
    expect(lambdaAssociationConfigItem).toMatchObject(lambdaConfig)
  })
})
