/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, getAvailableApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query'); // 🔑 自定义分类用 query
  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  // 🔑 支持 query = 某个资源站 key，直接调用该资源站
  const site = apiSites.find((s) => s.key === query);

  let results: any[] = [];
  if (site) {
    try {
      results = await searchFromApi(site, ''); // 分类调用可传空关键词
    } catch (err: any) {
      console.warn(`自定义分类调用 ${site.name} 失败:`, err.message);
    }
  } else {
    // 默认行为：把 query 当关键词搜索所有资源站
    const searchPromises = apiSites.map((site) =>
      Promise.race([
        searchFromApi(site, query),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${site.name} timeout`)), 20000)
        ),
      ]).catch((err) => {
        console.warn(`搜索失败 ${site.name}:`, err.message);
        return [];
      })
    );

    const settled = await Promise.allSettled(searchPromises);
    results = settled
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<any>).value)
      .flat();
  }

  // 🔒 敏感分类过滤
  if (!config.SiteConfig.DisableYellowFilter) {
    results = results.filter((r) => {
      const typeName = r.type_name || '';
      return !yellowWords.some((w: string) => typeName.includes(w));
    });
  }

  const cacheTime = await getCacheTime();

  if (results.length === 0) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  return NextResponse.json(
    { results },
    {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    }
  );
}
