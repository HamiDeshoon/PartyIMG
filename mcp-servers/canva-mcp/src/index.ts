import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { startOAuthFlow, loadSavedTokens } from './auth.js';
import { CanvaClient } from './canva-client.js';

const server = new Server(
  {
    name: 'canva-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const canvaClient = new CanvaClient();

// Define available MCP tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'canva_auth_login',
        description: 'Initiate OAuth 2.0 PKCE login to authenticate with Canva Connect API. Returns auth URL and opens local callback server on port 3000.',
        inputSchema: {
          type: 'object',
          properties: {
            port: { type: 'number', description: 'Local callback server port (default 3000)' }
          }
        }
      },
      {
        name: 'canva_get_profile',
        description: 'Get authenticated Canva user profile details.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'canva_list_designs',
        description: 'List or search Canva designs for the authenticated user.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Filter designs by search query' },
            continuation: { type: 'string', description: 'Pagination continuation token' },
            sort_by: { type: 'string', description: 'Sorting order (e.g. modified_descending)' }
          }
        }
      },
      {
        name: 'canva_get_design',
        description: 'Get metadata and access details for a specific Canva design.',
        inputSchema: {
          type: 'object',
          properties: {
            designId: { type: 'string', description: 'The unique ID of the Canva design' }
          },
          required: ['designId']
        }
      },
      {
        name: 'canva_create_design',
        description: 'Create a new blank design in Canva.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title of the new design' },
            preset: { type: 'string', description: 'Preset type (e.g. doc, presentation, social_media)' },
            width: { type: 'number', description: 'Custom width in px' },
            height: { type: 'number', description: 'Custom height in px' },
            assetId: { type: 'string', description: 'Optional asset ID to start design with' }
          }
        }
      },
      {
        name: 'canva_export_design',
        description: 'Export a Canva design to a downloadable format (PDF, PNG, JPG, MP4, GIF, PPTX).',
        inputSchema: {
          type: 'object',
          properties: {
            designId: { type: 'string', description: 'The design ID to export' },
            format: {
              type: 'string',
              enum: ['pdf', 'png', 'jpg', 'mp4', 'gif', 'pptx'],
              description: 'Target export file format'
            },
            quality: { type: 'string', description: 'Optional quality parameter' }
          },
          required: ['designId', 'format']
        }
      },
      {
        name: 'canva_upload_asset',
        description: 'Upload a local image or media file to Canva asset library.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Absolute file path to the image or media file' },
            title: { type: 'string', description: 'Asset display title in Canva' }
          },
          required: ['filePath']
        }
      },
      {
        name: 'canva_autofill',
        description: 'Autofill a Canva Brand Template with custom text and image assets.',
        inputSchema: {
          type: 'object',
          properties: {
            brandTemplateId: { type: 'string', description: 'The Canva Brand Template ID' },
            title: { type: 'string', description: 'Title for the generated design' },
            data: {
              type: 'object',
              description: 'Autofill data map matching template field keys to content object (e.g. { "title": { "type": "text", "text": "Hello" } })'
            }
          },
          required: ['brandTemplateId', 'data']
        }
      },
      {
        name: 'canva_list_folder_items',
        description: 'List items inside a specific Canva folder.',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: { type: 'string', description: 'The Canva folder ID' }
          },
          required: ['folderId']
        }
      }
    ]
  };
});

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'canva_auth_login': {
        const port = Number(args.port) || 3000;
        const { authUrl, waitForCompletion } = await startOAuthFlow(port);
        
        // Start background wait
        waitForCompletion().then((tokens) => {
          console.error('OAuth Authentication completed successfully. Scope:', tokens.scope);
        }).catch((err) => {
          console.error('OAuth Error:', err.message);
        });

        return {
          content: [
            {
              type: 'text',
              text: `Canva OAuth PKCE flow initiated.\n\n1. Open the following URL in your browser to authorize access:\n\n${authUrl}\n\n2. The local server is listening at http://localhost:${port}/oauth/callback to receive the code.`
            }
          ]
        };
      }

      case 'canva_get_profile': {
        const profile = await canvaClient.getUserProfile();
        return {
          content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }]
        };
      }

      case 'canva_list_designs': {
        const designs = await canvaClient.listDesigns({
          query: args.query as string,
          continuation: args.continuation as string,
          sort_by: args.sort_by as string
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(designs, null, 2) }]
        };
      }

      case 'canva_get_design': {
        const design = await canvaClient.getDesign(args.designId as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(design, null, 2) }]
        };
      }

      case 'canva_create_design': {
        let designType: any;
        if (args.width && args.height) {
          designType = { type: 'custom', width: Number(args.width), height: Number(args.height) };
        } else if (args.preset) {
          designType = { type: 'preset', name: args.preset as string };
        } else {
          designType = { type: 'preset', name: 'doc' };
        }

        const newDesign = await canvaClient.createDesign({
          design_type: designType,
          asset_id: args.assetId as string,
          title: args.title as string
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(newDesign, null, 2) }]
        };
      }

      case 'canva_export_design': {
        const exportResult = await canvaClient.exportDesign(
          args.designId as string,
          args.format as any,
          args.quality ? { quality: args.quality } : {}
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(exportResult, null, 2) }]
        };
      }

      case 'canva_upload_asset': {
        const asset = await canvaClient.uploadAsset(
          args.filePath as string,
          args.title as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(asset, null, 2) }]
        };
      }

      case 'canva_autofill': {
        const result = await canvaClient.autofillDesign(
          args.brandTemplateId as string,
          args.data as Record<string, any>,
          args.title as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'canva_list_folder_items': {
        const items = await canvaClient.listFolderItems(args.folderId as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(items, null, 2) }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing Canva tool '${name}': ${error.message || String(error)}`
        }
      ]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Canva Connect MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error starting Canva MCP server:', err);
  process.exit(1);
});
