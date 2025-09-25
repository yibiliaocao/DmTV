/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { GetBangumiCalendarData } from '@/lib/bangumi.client';
import {
  getDoubanCategories,
  getDoubanList,
  getDoubanRecommends,
} from '@/lib/douban.client';
import { DoubanItem, DoubanResult } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanCustomSelector from '@/components/DoubanCustomSelector';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

function DoubanPageClient() {
  const searchParams = useSearchParams();
  const [doubanData, setDoubanData] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectorsReady, setSelectorsReady] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentParamsRef = useRef({
    type: '',
    primarySelection: '',
    secondarySelection: '',
    multiLevelSelection: {} as Record<string, string>,
    selectedWeekday: '',
    currentPage: 0,
  });

  const type = searchParams.get('type') || 'movie';

  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    if (type === 'movie') return '热门';
    if (type === 'tv' || type === 'show') return '最近热门';
    if (type === 'anime') return '每日放送';
    return '';
  });

  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    if (type === 'movie') return '全部';
    if (type === 'tv' || type === 'show') return type;
    return '全部';
  });

  const [multiLevelValues, setMultiLevelValues] = useState<Record<string, string>>({
    type: 'all',
    region: 'all',
    year: 'all',
    platform: 'all',
    label: 'all',
    sort: 'T',
  });

  const [selectedWeekday, setSelectedWeekday] = useState<string>('');

  // 获取自定义分类
  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setCustomCategories(runtimeConfig.CUSTOM_CATEGORIES);
    }
  }, []);

  // 同步最新参数值到 ref
  useEffect(() => {
    currentParamsRef.current = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      selectedWeekday,
      currentPage,
    };
  }, [
    type,
    primarySelection,
    secondarySelection,
    multiLevelValues,
    selectedWeekday,
    currentPage,
  ]);

  // 初始化选择器准备状态
  useEffect(() => {
    const timer = setTimeout(() => setSelectorsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // type变化时重置选择器
  useEffect(() => {
    setSelectorsReady(false);
    setLoading(true);
  }, [type]);

  useEffect(() => {
    if (type === 'custom' && customCategories.length > 0) {
      const types = Array.from(new Set(customCategories.map((cat) => cat.type)));
      let selectedType = types.includes('movie') ? 'movie' : types[0] || 'movie';
      setPrimarySelection(selectedType);

      const firstCategory = customCategories.find((cat) => cat.type === selectedType);
      setSecondarySelection(firstCategory?.query || '');
    } else {
      if (type === 'movie') {
        setPrimarySelection('热门');
        setSecondarySelection('全部');
      } else if (type === 'tv') {
        setPrimarySelection('最近热门');
        setSecondarySelection('tv');
      } else if (type === 'show') {
        setPrimarySelection('最近热门');
        setSecondarySelection('show');
      } else if (type === 'anime') {
        setPrimarySelection('每日放送');
        setSecondarySelection('全部');
      } else {
        setPrimarySelection('');
        setSecondarySelection('全部');
      }
    }

    setMultiLevelValues({
      type: 'all',
      region: 'all',
      year: 'all',
      platform: 'all',
      label: 'all',
      sort: 'T',
    });

    const timer = setTimeout(() => setSelectorsReady(true), 50);
    return () => clearTimeout(timer);
  }, [type, customCategories]);

  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  const isSnapshotEqual = useCallback(
    (
      s1: typeof currentParamsRef.current,
      s2: typeof currentParamsRef.current
    ) => {
      return (
        s1.type === s2.type &&
        s1.primarySelection === s2.primarySelection &&
        s1.secondarySelection === s2.secondarySelection &&
        s1.selectedWeekday === s2.selectedWeekday &&
        s1.currentPage === s2.currentPage &&
        JSON.stringify(s1.multiLevelSelection) === JSON.stringify(s2.multiLevelSelection)
      );
    },
    []
  );

  const getRequestParams = useCallback(
    (pageStart: number) => {
      if (type === 'tv' || type === 'show') {
        return { kind: 'tv' as const, category: type, type: secondarySelection, pageLimit: 25, pageStart };
      }
      return { kind: type as 'tv' | 'movie', category: primarySelection, type: secondarySelection, pageLimit: 25, pageStart };
    },
    [type, primarySelection, secondarySelection]
  );

  // 初始化加载数据
  const loadInitialData = useCallback(async () => {
    const requestSnapshot = { ...currentParamsRef.current, currentPage: 0 };

    try {
      setLoading(true);
      setDoubanData([]);
      setCurrentPage(0);
      setHasMore(true);
      setIsLoadingMore(false);

      let data: DoubanResult;

      if (type === 'custom') {
        const res = await fetch(`/api/custom?tag=${encodeURIComponent(secondarySelection)}&type=${encodeURIComponent(primarySelection)}&page=0`);
        const json = await res.json();
        data = { code: json.code || 200, message: json.message || 'success', list: json.list || [] };
      } else if (type === 'anime' && primarySelection === '每日放送') {
        const calendarData = await GetBangumiCalendarData();
        const weekdayData = calendarData.find((item) => item.weekday.en === selectedWeekday);
        data = { code: 200, message: 'success', list: weekdayData?.items.map(item => ({
          id: item.id?.toString() || '',
          title: item.name_cn || item.name,
          poster: item.images.large || item.images.common || item.images.medium || item.images.small || item.images.grid,
          rate: item.rating?.score?.toFixed(1) || '',
          year: item.air_date?.split('-')?.[0] || '',
        })) || [] };
      } else if (type === 'anime') {
        data = await getDoubanRecommends({
          kind: primarySelection === '番剧' ? 'tv' : 'movie',
          pageLimit: 25,
          pageStart: 0,
          category: '动画',
          format: primarySelection === '番剧' ? '电视剧' : '',
          region: multiLevelValues.region,
          year: multiLevelValues.year,
          platform: multiLevelValues.platform,
          sort: multiLevelValues.sort,
          label: multiLevelValues.label,
        });
      } else if (primarySelection === '全部') {
        data = await getDoubanRecommends({
          kind: type === 'show' ? 'tv' : type as 'tv' | 'movie',
          pageLimit: 25,
          pageStart: 0,
          category: multiLevelValues.type,
          format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
          region: multiLevelValues.region,
          year: multiLevelValues.year,
          platform: multiLevelValues.platform,
          sort: multiLevelValues.sort,
          label: multiLevelValues.label,
        });
      } else {
        data = await getDoubanCategories(getRequestParams(0));
      }

      if (data.code === 200) {
        const currentSnapshot = { ...currentParamsRef.current };
        if (isSnapshotEqual(requestSnapshot, currentSnapshot)) {
          setDoubanData(data.list);
          setHasMore(data.list.length !== 0);
          setLoading(false);
        }
      } else {
        throw new Error(data.message || '获取数据失败');
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }, [type, primarySelection, secondarySelection, multiLevelValues, selectedWeekday, getRequestParams, isSnapshotEqual]);

  // 初始化数据加载
  useEffect(() => {
    if (!selectorsReady) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => loadInitialData(), 100);
    return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
  }, [selectorsReady, type, primarySelection, secondarySelection, multiLevelValues, selectedWeekday, loadInitialData]);

  // 分页加载更多
  useEffect(() => {
    if (currentPage <= 0) return;

    const fetchMoreData = async () => {
      const requestSnapshot = { ...currentParamsRef.current };

      try {
        setIsLoadingMore(true);
        let data: DoubanResult;

        if (type === 'custom') {
          const res = await fetch(`/api/custom?tag=${encodeURIComponent(secondarySelection)}&type=${encodeURIComponent(primarySelection)}&page=${currentPage}`);
          const json = await res.json();
          data = { code: json.code || 200, message: json.message || 'success', list: json.list || [] };
        } else if (type === 'anime' && primarySelection === '每日放送') {
          data = { code: 200, message: 'success', list: [] };
        } else if (type === 'anime') {
          data = await getDoubanRecommends({
            kind: primarySelection === '番剧' ? 'tv' : 'movie',
            pageLimit: 25,
            pageStart: currentPage * 25,
            category: '动画',
            format: primarySelection === '番剧' ? '电视剧' : '',
            region: multiLevelValues.region,
            year: multiLevelValues.year,
            platform: multiLevelValues.platform,
            sort: multiLevelValues.sort,
            label: multiLevelValues.label,
          });
        } else if (primarySelection === '全部') {
          data = await getDoubanRecommends({
            kind: type === 'show' ? 'tv' : type as 'tv' | 'movie',
            pageLimit: 25,
            pageStart: currentPage * 25,
            category: multiLevelValues.type,
            format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
            region: multiLevelValues.region,
            year: multiLevelValues.year,
            platform: multiLevelValues.platform,
            sort: multiLevelValues.sort,
            label: multiLevelValues.label,
          });
        } else {
          data = await getDoubanCategories(getRequestParams(currentPage * 25));
        }

        if (data.code === 200) {
          const currentSnapshot = { ...currentParamsRef.current };
          if (isSnapshotEqual(requestSnapshot, currentSnapshot)) {
            setDoubanData((prev) => [...prev, ...data.list]);
            setHasMore(data.list.length !== 0);
          }
        } else {
          throw new Error(data.message || '获取数据失败');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingMore(false);
      }
    };

    fetchMoreData();
  }, [currentPage, type, primarySelection, secondarySelection, multiLevelValues, selectedWeekday, getRequestParams, isSnapshotEqual]);

  // 下拉加载更多观察器
  useEffect(() => {
    if (!loadingRef.current) return;

    observerRef.current = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first.isIntersecting && hasMore && !isLoadingMore) {
        setCurrentPage((prev) => prev + 1);
      }
    }, { threshold: 1 });

    observerRef.current.observe(loadingRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoadingMore]);

  return (
    <PageLayout>
      {selectorsReady && (
        <Suspense fallback={<div>加载选择器...</div>}>
          {type === 'custom' ? (
            <DoubanCustomSelector
              primarySelection={primarySelection}
              secondarySelection={secondarySelection}
              setPrimarySelection={setPrimarySelection}
              setSecondarySelection={setSecondarySelection}
              categories={customCategories}
            />
          ) : (
            <DoubanSelector
              type={type}
              primarySelection={primarySelection}
              secondarySelection={secondarySelection}
              multiLevelValues={multiLevelValues}
              setPrimarySelection={setPrimarySelection}
              setSecondarySelection={setSecondarySelection}
              setMultiLevelValues={setMultiLevelValues}
              selectedWeekday={selectedWeekday}
              setSelectedWeekday={setSelectedWeekday}
            />
          )}
        </Suspense>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
        {loading
          ? skeletonData.map((i) => <DoubanCardSkeleton key={i} />)
          : doubanData.map((item) => <VideoCard key={item.id} item={item} />)}
      </div>

      <div ref={loadingRef} className="my-6 flex justify-center">
        {isLoadingMore && <span>加载中...</span>}
        {!hasMore && !loading && <span>没有更多数据</span>}
      </div>
    </PageLayout>
  );
}

export default DoubanPageClient;
