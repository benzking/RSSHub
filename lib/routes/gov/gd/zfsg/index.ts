import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/gd/zfsg/:channel?',
    name: '栏目内容',
    maintainers: ['benzking'],
    categories: ['government'],
    example: '/gov/gd/zfsg/zcjd2',
    parameters: {
        channel: {
            alias: 'zcjd2',
            type: 'enum',
            options: [
                { value: 'zcjd2', label: '政策解读' },
                { value: 'sjyw', label: '数据要闻' },
                { value: 'mtbd', label: '媒体报道' },
                { value: 'gggs', label: '公告公示' },
                { value: 'wjk', label: '文件库' },
            ],
            default: 'zcjd2',
            description: '栏目路径，默认为 `zcjd2`（政策解读）',
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['zfsg.gd.gov.cn/zwgk/zcjd2/mindex.html'],
            target: '/gov/gd/zfsg/zcjd2',
        },
        {
            source: ['zfsg.gd.gov.cn/xxfb/sjyw/mindex.html'],
            target: '/gov/gd/zfsg/sjyw',
        },
        {
            source: ['zfsg.gd.gov.cn/xxfb/mtbd/mindex.html'],
            target: '/gov/gd/zfsg/mtbd',
        },
        {
            source: ['zfsg.gd.gov.cn/zwgk/gggs/mindex.html'],
            target: '/gov/gd/zfsg/gggs',
        },
        {
            source: ['zfsg.gd.gov.cn/zwgk/wjk/mindex.html'],
            target: '/gov/gd/zfsg/wjk',
        },
    ],
    description: '广东省政务服务和数据管理局（zfsg.gd.gov.cn）RSS 路由，支持以下栏目：\n\n- `zcjd2` — 政策解读\n- `sjyw` — 数据要闻（新闻中心）\n- `mtbd` — 媒体报道\n- `gggs` — 公告公示（政务公开）\n- `wjk` — 文件库（政务公开）',
    handler,
};

const channelMap: Record<string, { path: string; name: string }> = {
    zcjd2: { path: '/zwgk/zcjd2', name: '政策解读' },
    sjyw: { path: '/xxfb/sjyw', name: '数据要闻' },
    mtbd: { path: '/xxfb/mtbd', name: '媒体报道' },
    gggs: { path: '/zwgk/gggs', name: '公告公示' },
    wjk: { path: '/zwgk/wjk', name: '文件库' },
};

const baseUrl = 'https://zfsg.gd.gov.cn';

async function handler(ctx) {
    const channel = ctx.req.param('channel') || 'zcjd2';

    const channelInfo = channelMap[channel];
    if (!channelInfo) {
        const validChannels = Object.keys(channelMap).join(', ');
        throw new Error(`不支持的栏目: ${channel}，可选: ${validChannels}`);
    }

    const listUrl = `${baseUrl}${channelInfo.path}/mindex.html`;
    const { data } = await got(listUrl);
    const $ = load(data);

    const items = $('ul.viewList li')
        .toArray()
        .map((li) => {
            const a = $(li).find('div.til a');
            const timeStr = $(li).find('div.time').text().replace('发布日期：', '').trim();
            return {
                title: a.attr('title') || a.text().trim(),
                link: a.attr('href') || '',
                pubDate: timeStr ? timezone(parseDate(timeStr, 'YYYY-MM-DD'), +8) : undefined,
            };
        })
        .filter((item) => item.link && item.title);

    const detailedItems = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                const { data: detailData } = await got(item.link);
                const $detail = load(detailData);

                const title =
                    $detail('meta[name="ArticleTitle"]').attr('content') ||
                    $detail('h3.zw-title').text().trim() ||
                    item.title;
                const pubDateStr = $detail('meta[name="PubDate"]').attr('content');
                const pubDate = pubDateStr ? timezone(parseDate(pubDateStr, 'YYYY-MM-DD HH:mm'), +8) : item.pubDate;
                const description = $detail('div.zw').html() || $detail('div.Con').html() || '';
                const author = $detail('meta[name="ContentSource"]').attr('content') || '';

                return {
                    title,
                    link: item.link,
                    description,
                    pubDate,
                    author,
                };
            })
        )
    );

    return {
        title: `${channelInfo.name} — 广东省政务服务和数据管理局`,
        link: listUrl,
        item: detailedItems,
        language: 'zh-CN',
    };
}
