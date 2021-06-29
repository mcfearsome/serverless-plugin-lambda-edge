const UpdateLambdaFunctionAssociationPlugin = require('../src/index.js')
const Serverless = require('serverless');
class StubService {
  constructor(provider) {
    this.provider = provider
    this.custom = {
      workareaEdge: {
        cloudFrontId: 'XXXX',
        cacheBehaviors: ['default','/categories/*']
      }
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

const awsProviderRequestMatcher = (serviceName, methodName, key) => {
  return (service, method, params, options) => {
    const paramCondition = (key !== null) ? (key in params) : true
    return service.toLowerCase() === serviceName.toLowerCase() &&
      method.toLowerCase() === methodName.toLowerCase() &&
      paramCondition
  }
}

const isLambdaListVersionsByFunction = awsProviderRequestMatcher('lambda', 'listVersionsByFunction', 'FunctionName')

const isCloudFrontDistributionConfigRequest = awsProviderRequestMatcher('cloudfront', 'getDistributionConfig', 'Id')

const isCloudFrontUdateDistributionRequest = awsProviderRequestMatcher('cloudfront', 'updateDistribution', null)

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
        // noop
      }
    }
  }

  getProvider(_) {
    return this.provider
  }
}

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

describe('update lambda function association plugin', () => {
  const stubServerless = new StubServerless()
  const plugin = new UpdateLambdaFunctionAssociationPlugin(stubServerless, {})
  
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
    const config = stubServerless.getProvider().distributionConfig.DistributionConfig
    expect(config.DefaultCacheBehavior.LambdaFunctionAssociations.Items).toMatchObject(lambdaConfig)
    expect(config.CacheBehaviors.Items[0].LambdaFunctionAssociations.Items).toMatchObject(lambdaConfig)
    expect(config.CacheBehaviors.Items[1].LambdaFunctionAssociations).toMatchObject(emptyAwsArray)
  })

  test('getUpdatedLambdaAssociationConfigs', async () => {
    const lambdaAssociationConfigItem = await plugin.getUpdatedLambdaAssociationConfigItems()
    expect(lambdaAssociationConfigItem).toMatchObject(lambdaConfig)
  })
})
