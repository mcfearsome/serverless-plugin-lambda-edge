const AWS = require('aws-sdk')
const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION } = process.env

class UpdateLambdaFunctionAssociationPlugin {
  constructor(serverless, options) {
    this.serverless = serverless

    const newCustomPropSchema = {
      type: 'object',
      properties: {
        workareaEdge: {
          type: 'object',
          properties: {
            cloudFrontId: { type: 'string' },
            cacheBehaviors: { type: 'array', items: {type: 'string'}},
          },
          required: ['cloudFrontId'],
        },
      },
      required: ['workareaEdge'],
    };
    
    serverless.configSchemaHandler.defineCustomProperties(newCustomPropSchema);

    const newFunctionPropSchema = {
      properties: {
        eventType: { enum: ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'] },
      },
      required: ['eventType'],
    }

    serverless.configSchemaHandler.defineFunctionProperties('aws', newFunctionPropSchema)

    this.provider = serverless.getProvider('aws')
    this.hooks = {
      'after:deploy:deploy': this.updateLambdaFunctionAssociations.bind(this)
    }
    this.custom = this.serverless.service.custom.workareaEdge
    this.functions = this.serverless.service.functions
  }

  async updateLambdaFunctionAssociations() {
    await Promise.all([
      this.getCloudFrontConfig(),
      this.getUpdatedLambdaAssociationConfig()
    ]).then(async ([cloudFrontConfig, lambdaAssociationConfig]) => {
      this.serverless.cli.log('LambdaEdge: Get specified CloudFront distribution config')

      cloudFrontConfig['Id'] = this.custom.cloudFrontId
      cloudFrontConfig['IfMatch'] = cloudFrontConfig['ETag']

      if (!this.custom.cacheBehaviors || this.custom.cacheBehaviors.includes('default')) {
        cloudFrontConfig['DistributionConfig']['DefaultCacheBehavior']['LambdaFunctionAssociations'] = lambdaAssociationConfig
      }

      cloudFrontConfig['DistributionConfig']['CacheBehaviors']['Items'] = cloudFrontConfig['DistributionConfig']['CacheBehaviors']['Items'].map(item => {
        if ((this.custom.cacheBehaviors.includes(item['PathPattern']))) {
          item['LambdaFunctionAssociations'] = lambdaAssociationConfig
        }
        return item
      })

      // "CloudFront.updateDistribution" method's param doesn't need ETag
      delete cloudFrontConfig['ETag']

      await this.updateCloudFrontConfig(cloudFrontConfig)

      this.serverless.cli.log('LambdaEdge: Successfully update lambda function association on CloudFront')
    })
  }

  async getCloudFrontConfig() {
    return await this.provider.request('CloudFront', 'getDistributionConfig', { Id: this.custom.cloudFrontId })
  }

  async updateCloudFrontConfig(cloudFrontConfig) {
    if (!cloudFrontConfig) {
      throw new this.serverless.classes.Error('LambdaEdge: Missing CloudFront config')
    }
    return await this.provider.request('CloudFront', 'updateDistribution', cloudFrontConfig)
  }

  async getUpdatedLambdaAssociationConfig() {
    return await this.getUpdatedLambdaAssociationConfigItems()
      .then((items) => ({
        Quantity: items.length,
        Items: items
      }))
  }

  async getLatestFunction(functionName) {
    const functions = await this.provider.request('Lambda', 'listVersionsByFunction', {
      FunctionName: functionName
    })
    const initialData = {Version: '0'}
    const latestFunction = functions['Versions'].reduce((prev, current) => {
      const prevVersion = parseInt(prev['Version'])
      const currentVersion = parseInt(current['Version'])
      if (Number.isNaN(currentVersion)) {
        return prev
      }
      if (prevVersion > currentVersion) {
        return prev
      }
      return current
    }, initialData)
    if (latestFunction['Version'] === initialData['Version']) {
      throw new this.serverless.classes.Error("LambdaEdge: Couldn't get latest lambda function")
    }
    return latestFunction
  }

  async getUpdatedLambdaAssociationConfigItems() {
    return await Promise.all(Object.values(this.functions).map(async ({ name, eventType }) => {
      const latestFunction = await this.getLatestFunction(name)
      return {
        EventType: eventType,
        LambdaFunctionARN: latestFunction['FunctionArn'],
        IncludeBody: false
      }
    }))
  }
}

module.exports = UpdateLambdaFunctionAssociationPlugin
