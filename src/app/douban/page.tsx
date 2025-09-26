/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import DoubanCustomSelector from '@/components/DoubanCustomSelector';
import VideoCard, { VideoCardHandle } from '@/components/VideoCard';
import { DoubanItem } from '@/lib/types';
import { fetchFromApi } from '@/lib/downstream';

export default function Page() {
  const [doubanData, setDoubanData] = useState<DoubanItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState<'movie' | 'tv' | 'custom'>('movie');
  const [primarySelection, setPrimarySelection] = useState('');
  const [secondarySelection, setSecondarySelection] = useState('');
  const [weekday, setWeekday] = useState('');
  const [customCategories, setCustomCategories] = useState<
    { name: string; type: 'movie' | 'tv'; query: string }[]
  >([]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 原始加载函数，加入 custom 分类支持
  const loadInitialData = async (
    reset: boolean = false,
    customCategory?: { name: string; type: 'movie' | 'tv'; query: string }
  ) => {
    setLoading(true);

    try {
      let result: DoubanItem[] = [];
      if (type === 'custom' && customCategory) {
        const res = await fetchFromApi({
          apiUrl: customCategory.query,
          page: reset ? 1 : page,
        });
        result = res?.items || [];
      } else {
        const res = await fetchFromApi({
          type,
          category: primarySelection,
          subcategory: secondarySelection,
          weekday,
          page: reset ? 1 : page,
        });
        result = res?.items || [];
      }

      if (reset) {
        setDoubanData(result);
        setPage(2);
      } else {
        setDoubanData((prev) => [...prev, ...result]);
        setPage((prev) => prev + 1);
      }
      setHasMore(result.length > 0);
    } catch (error) {
      console.error('加载数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  // 监听分类配置
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).RUNTIME_CONFIG) {
      const cfg = (window as any).RUNTIME_CONFIG;
      if (cfg?.customCategories) {
        setCustomCategories(cfg.customCategories);
      }
    }
  }, []);

  // 选择变化时重新加载
  useEffect(() => {
    if (type === 'custom') {
      const selected = customCategories.find((c) => c.name === primarySelection);
      if (selected) {
        loadInitialData(true, selected);
      }
    } else {
      loadInitialData(true);
    }
  }, [type, primarySelection, secondarySelection, weekday]);

  // 加载更多
  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          if (type === 'custom') {
            const selected = customCategories.find((c) => c.name === primarySelection);
            if (selected) {
              loadInitialData(false, selected);
            }
          } else {
            loadInitialData();
          }
        }
      },
      { threshold: 1.0 }
    );

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasMore, loading, type, primarySelection, secondarySelection, weekday]);

  const handlePrimaryChange = (value: string) => {
    setPrimarySelection(value);
    setSecondarySelection('');
    setPage(1);
    setDoubanData([]);
  };

  const handleSecondaryChange = (value: string) => {
    setSecondarySelection(value);
    setPage(1);
    setDoubanData([]);
  };

  const handleWeekdayChange = (day: string) => {
    setWeekday(day);
    setPage(1);
    setDoubanData([]);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左侧分类选择 */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">分类</h2>
        <div className="space-y-2">
          <button
            className={`block w-full text-left px-2 py-1 rounded ${
              type === 'movie'
                ? 'bg-blue-500 text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            onClick={() => setType('movie')}
          >
            电影
          </button>
          <button
            className={`block w-full text-left px-2 py-1 rounded ${
              type === 'tv'
                ? 'bg-blue-500 text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            onClick={() => setType('tv')}
          >
            电视剧
          </button>
          {customCategories.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                自定义分类
              </h3>
              {customCategories.map((cat) => (
                <button
                  key={cat.name}
                  className={`block w-full text-left px-2 py-1 rounded ${
                    type === 'custom' && primarySelection === cat.name
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => {
                    setType('custom');
                    handlePrimaryChange(cat.name);
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center mb-6">
          <Link href="/" className="text-blue-500 hover:underline">
            首页
          </Link>
          <ChevronRight className="mx-2 h-4 w-4 text-gray-400" />
          <span className="text-gray-700 dark:text-gray-300">豆瓣推荐</span>
        </div>

        <div className="mb-4">
          <DoubanCustomSelector
            customCategories={customCategories}
            primarySelection={primarySelection}
            secondarySelection={secondarySelection}
            onPrimaryChange={handlePrimaryChange}
            onSecondaryChange={handleSecondaryChange}
            onWeekdayChange={handleWeekdayChange}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {doubanData.length === 0 && !loading ? (
            <div className="col-span-full text-center text-gray-500">
              暂无数据
            </div>
          ) : (
            doubanData.map((item, index) => (
              <div key={`${item.title}-${index}`} className="w-full">
                <VideoCard data={item} />
              </div>
            ))
          )}
        </div>

        {loading && (
          <div className="text-center py-4 text-gray-500">加载中...</div>
        )}
        <div ref={loadMoreRef} className="h-10"></div>
      </div>
    </div>
  );
}
