import {
	IBinaryData,
	IExecuteFunctions, ILoadOptionsFunctions,
	INodeExecutionData, INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';


async function toBase64DataURL(url: string) {
	const response = await fetch(url);
	const blob = await response.blob();
	const buffer = Buffer.from(await blob.arrayBuffer());
	return "data:" + blob.type + ';base64,' + buffer.toString('base64');
}

type ControlNetUnit = {
	input_image?: string;
};

async function mapUnitsToBase64(units?: Array<ControlNetUnit>): Promise<Array<ControlNetUnit> | undefined> {
	if (!units) {
		return units;
	}

	return Promise.all(units.map(async unit => {
		if (!unit.input_image) {
			return unit;
		}
		return {
			...unit,
			input_image: await toBase64DataURL(unit.input_image),
		}
	}));
}

export class Automatic1111Node implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Automatic1111 Node',
		name: 'automatic1111Node',
		// eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg
		icon: 'file:20920490.png',
		group: ['transform'],
		version: 1,
		description: 'Automatic1111 Node',
		defaults: {
			name: 'Automatic1111 Node',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'automatic1111CredentialsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				description: 'Choose from the list. Choose from the list, or specify an model using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>.',
				default: '',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'loadModels',
				},
			},
			{
				displayName: 'Sampler Method Name or ID',
				name: 'sampler',
				type: 'options',
				description: 'Choose from the list. Choose from the list, or specify an sampler using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>.',
				default: '',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'loadSamplers',
				},
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				default: '',
				placeholder: 'void, nebula, storm, sun, purple, pink, centered, painted, intricate, volumetric lighting, beautiful, rich deep colors masterpiece, sharp focus, ultra detailed, in the style of dan mumford and marc simonetti, astrophotography, magnificent, celestial, ethereal, epic, magical, dreamy, chiaroscuro, atmospheric lighting,',
				required: true,
			},
			{
				displayName: 'Negative Prompt',
				name: 'negative_prompt',
				type: 'string',
				default: '',
				placeholder: 'bad quality, worst quality, text, username, watermark, blurry, ',
			},
			{
				displayName: 'Width',
				name: 'width',
				type: 'number',
				default: 512,
				required: true,
			},
			{
				displayName: 'Height',
				name: 'height',
				type: 'number',
				default: 512,
				required: true,
			},
			{
				displayName: 'Steps',
				name: 'steps',
				type: 'number',
				default: 20,
				required: true,
			},
			{
				displayName: 'Cfg Scale',
				name: 'cfg_scale',
				type: 'number',
				default: 7,
				required: true,
			},
			{
				displayName: 'Seed',
				name: 'seed',
				type: 'number',
				default: -1,
				required: true,
			},
			{
				displayName: 'Batch count',
				name: 'batchCount',
				type: 'number',
				default: 1,
				required: true,
			},
			{
				description: 'ControlNet Units (array)',
				placeholder: '[]',
				displayName: 'ControlNet Units (array)',
				name: 'controlNetUnits',
				typeOptions: {
					alwaysOpenEditWindow: true,
					rows: 10,
				},
				type: 'json',
				default: '[]',
				// @ts-ignore
				validateType: 'array',
				// @ts-ignore
				ignoreValidationDuringExecution: true,
				hint: 'https://github.com/Mikubill/sd-webui-controlnet/wiki/API#controlnetunitrequest-json-object',
				required: false,
			},
		],
	};

	methods = {
		loadOptions: {
			async loadModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];

				let credentials;
				try {
					credentials = await this.getCredentials('automatic1111CredentialsApi');
				} catch (e) {
					return [];
				}

				await this.helpers.requestWithAuthentication.call(this, 'automatic1111CredentialsApi', {
					method: 'POST',
					uri: credentials.host + '/sdapi/v1/refresh-checkpoints',
				});
				const models = await this.helpers.requestWithAuthentication.call(this, 'automatic1111CredentialsApi', {
					method: 'GET',
					uri: credentials.host + '/sdapi/v1/sd-models',
					json: true,
				});
				for (const model of models) {
					returnData.push({
						name: model.model_name,
						value: model.model_name
					});
				}

				return returnData;
			},
			async loadSamplers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];

				let credentials;
				try {
					credentials = await this.getCredentials('automatic1111CredentialsApi');
				} catch (e) {
					return [];
				}

				const samplers = await this.helpers.requestWithAuthentication.call(this, 'automatic1111CredentialsApi', {
					method: 'GET',
					uri: credentials.host + '/sdapi/v1/samplers',
					json: true,
				});
				for (const sampler of samplers) {
					returnData.push({
						name: sampler.name,
						value: sampler.name
					});
				}

				return returnData;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputItems = this.getInputData();
		const outputItems: Array<INodeExecutionData> = [];

		const credentials = await this.getCredentials('automatic1111CredentialsApi');
		let model: string;
		let sampler: string;
		let prompt: string;
		let negative_prompt: string;
		let width: number;
		let height: number;
		let steps: number;
		let cfg_scale: number;
		let seed: number;
		let controlNetUnits: string;
		let batchCount: number;

		for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
			try {
				model = this.getNodeParameter('model', itemIndex) as string;
				sampler = this.getNodeParameter('sampler', itemIndex) as string;
				prompt = this.getNodeParameter('prompt', itemIndex) as string;
				negative_prompt = this.getNodeParameter('negative_prompt', itemIndex) as string;
				width = this.getNodeParameter('width', itemIndex) as number;
				height = this.getNodeParameter('height', itemIndex) as number;
				steps = this.getNodeParameter('steps', itemIndex) as number;
				cfg_scale = this.getNodeParameter('cfg_scale', itemIndex) as number;
				seed = this.getNodeParameter('seed', itemIndex) as number;
				controlNetUnits = this.getNodeParameter('controlNetUnits', itemIndex) as string;
				batchCount = this.getNodeParameter('batchCount', itemIndex) as number;

				await this.helpers.requestWithAuthentication.call(this, 'automatic1111CredentialsApi', {
					method: 'POST',
					uri: credentials.host + '/sdapi/v1/options',
					json: true,
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({'sd_model_checkpoint': model}),
				});

				const response = await this.helpers.requestWithAuthentication.call(this, 'automatic1111CredentialsApi', {
					method: 'POST',
					uri: credentials.host + '/sdapi/v1/txt2img',
					json: true,
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						'sampler_name': sampler,
						'prompt': prompt,
						'negative_prompt': negative_prompt,
						'steps': steps,
						'cfg_scale': cfg_scale,
						'width': width,
						'height': height,
						'seed': seed,
						'batch_size': batchCount,
						'alwayson_scripts': {
							'controlnet': {
								'args': controlNetUnits ? await mapUnitsToBase64(JSON.parse(controlNetUnits)) : [],
							},
						},
					}),
				});

				const binaryData: Array<IBinaryData> = await Promise.all(
					response.images.map(async (item: string) => {
						const data = await this.helpers.prepareBinaryData(Buffer.from(item, 'base64'));
						data.mimeType = 'image/jpg';
						data.fileExtension = 'jpg';
						data.fileType = 'image';
						data.fileName = 'image.jpg';
						return data;
					}),
				);

				binaryData.forEach(bin => {
					const item: INodeExecutionData = {
						binary: {
							data: bin,
						},
						json: response.parameters,
					};

					item.binary = {
						data: bin,
					};
					item.json = response.parameters;
					item.json.info = JSON.parse(response.info);

					outputItems.push(item);
				});

			} catch (error) {
				if (this.continueOnFail()) {
					inputItems.push({json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return this.prepareOutputData(outputItems);
	}
}
