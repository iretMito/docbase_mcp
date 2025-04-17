import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// DocBase APIのベースURL
const BASE_URL = 'https://api.docbase.io';

// 環境変数から値を取得
const DOCBASE_TOKEN = process.env.DOCBASE_TOKEN;
const DOCBASE_DOMAIN = process.env.DOCBASE_DOMAIN;

// 環境変数のチェック
if (!DOCBASE_TOKEN) {
  console.error('エラー: DOCBASE_TOKEN 環境変数が設定されていません。');
  process.exit(1);
}

if (!DOCBASE_DOMAIN) {
  console.error('エラー: DOCBASE_DOMAIN 環境変数が設定されていません。');
  process.exit(1);
}

// DocBase APIクライアント
const createDocBaseClient = () => {
  // 共通ヘッダー
  const headers = {
    'X-DocBaseToken': DOCBASE_TOKEN,
    'Content-Type': 'application/json',
  };

  return {
    // メモを検索するAPI
    async searchMemos(query: string, page = 1, perPage = 20) {
      const url = new URL(`/teams/${DOCBASE_DOMAIN}/posts`, BASE_URL);
      url.searchParams.append('q', query);
      url.searchParams.append('page', page.toString());
      url.searchParams.append('per_page', perPage.toString());

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `APIリクエストエラー: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    },

    // メモの詳細を取得するAPI
    async getMemo(id: string) {
      const url = new URL(`/teams/${DOCBASE_DOMAIN}/posts/${id}`, BASE_URL);
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `APIリクエストエラー: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    },
  };
};

// パラメータの型定義
interface SearchMemosParams {
  query: string;
  page?: number;
  perPage?: number;
}

interface GetMemoDetailParams {
  id: string;
}

// Create server instance
const server = new McpServer({
  name: 'docbase-mcp',
  version: '1.0.0',
  capabilities: {
    resources: {},
  },
});

// メモ検索ツールを登録
server.tool(
  'searchMemos',
  'DocBaseのメモを検索し、タイトル、URL、メモIDの配列を返します',
  {
    query: z.string().describe('検索キーワード'),
    page: z.number().optional().describe('ページ番号（1から開始）'),
    perPage: z.number().optional().describe('1ページあたりの結果数（最大100）'),
  },
  async ({ query, page, perPage }: SearchMemosParams) => {
    try {
      // perPageの値が100を超えないように制限
      const limitedPerPage = perPage && perPage > 100 ? 100 : perPage;

      const client = createDocBaseClient();
      const result = await client.searchMemos(query, page, limitedPerPage);

      // 必要な情報だけを抽出
      const memos = result.posts.map((post: any) => ({
        id: post.id,
        title: post.title,
        url: post.url,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                memos,
                total: result.meta.total,
                nextPage: result.meta.next_page,
                previousPage: result.meta.previous_page,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('不明なエラーが発生しました');
    }
  }
);

// メモ詳細取得ツールを登録
server.tool(
  'getMemoDetail',
  'DocBaseの特定のメモの詳細情報を取得します',
  {
    id: z.string().describe('メモのID'),
  },
  async ({ id }: GetMemoDetailParams) => {
    try {
      const client = createDocBaseClient();
      const memo = await client.getMemo(id);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: memo.id,
                title: memo.title,
                body: memo.body,
                url: memo.url,
                createdAt: memo.created_at,
                updatedAt: memo.updated_at,
                tags: memo.tags.map((tag: any) => tag.name),
                user: memo.user.name,
                groups: memo.groups.map((group: any) => group.name),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('不明なエラーが発生しました');
    }
  }
);

// MCPサーバーの起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.info('Docbase MCP Server running on stdin/stdout');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
