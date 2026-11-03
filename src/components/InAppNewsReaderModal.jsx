import React, { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, Calendar, Newspaper, Loader2, Share2 } from 'lucide-react';
import { useBackHandler } from '../context/NavigationContext';
import { fetchNewsArticle } from '../utils/servicesApi';

const SOURCE_CONFIG = {
  sharesansar: { label: 'ShareSansar', badgeBg: 'rgba(59, 130, 246, 0.15)', badgeColor: '#60a5fa', badgeBorder: 'rgba(59, 130, 246, 0.35)' },
  merolagani: { label: 'MeroLagani', badgeBg: 'rgba(16, 185, 129, 0.15)', badgeColor: '#34d399', badgeBorder: 'rgba(16, 185, 129, 0.35)' },
  nepalipaisa: { label: 'Nepali Paisa', badgeBg: 'rgba(34, 197, 94, 0.15)', badgeColor: '#4ade80', badgeBorder: 'rgba(34, 197, 94, 0.35)' },
  clickmandu: { label: 'Clickmandu', badgeBg: 'rgba(99, 102, 241, 0.15)', badgeColor: '#818cf8', badgeBorder: 'rgba(99, 102, 241, 0.35)' },
  karobar: { label: 'Karobar Daily', badgeBg: 'rgba(245, 158, 11, 0.15)', badgeColor: '#fbbf24', badgeBorder: 'rgba(245, 158, 11, 0.35)' },
  bizshala: { label: 'Bizshala', badgeBg: 'rgba(20, 184, 166, 0.15)', badgeColor: '#2dd4bf', badgeBorder: 'rgba(20, 184, 166, 0.35)' },
  bikashnews: { label: 'BikashNews', badgeBg: 'rgba(14, 165, 233, 0.15)', badgeColor: '#38bdf8', badgeBorder: 'rgba(14, 165, 233, 0.35)' },
  arthakendra: { label: 'Artha Kendra', badgeBg: 'rgba(168, 85, 247, 0.15)', badgeColor: '#c084fc', badgeBorder: 'rgba(168, 85, 247, 0.35)' },
  arthasarokar: { label: 'Artha Sarokar', badgeBg: 'rgba(244, 63, 94, 0.15)', badgeColor: '#fb7185', badgeBorder: 'rgba(244, 63, 94, 0.35)' },
};

function getSourceMeta(srcString) {
  const s = String(srcString || '').toLowerCase();
  if (s.includes('sharesansar')) return SOURCE_CONFIG.sharesansar;
  if (s.includes('merolagani')) return SOURCE_CONFIG.merolagani;
  if (s.includes('nepali paisa') || s.includes('nepalipaisa')) return SOURCE_CONFIG.nepalipaisa;
  if (s.includes('clickmandu')) return SOURCE_CONFIG.clickmandu;
  if (s.includes('sarokar') || s.includes('arthasarokar') || s.includes('artha karobar')) return SOURCE_CONFIG.arthasarokar;
  if (s.includes('kendra') || s.includes('arthakendra')) return SOURCE_CONFIG.arthakendra;
  if (s.includes('karobar')) return SOURCE_CONFIG.karobar;
  if (s.includes('bizshala')) return SOURCE_CONFIG.bizshala;
  if (s.includes('bikash')) return SOURCE_CONFIG.bikashnews;
  return { label: srcString || 'NEPSE Announcement', badgeBg: 'rgba(100, 116, 139, 0.15)', badgeColor: '#94a3b8', badgeBorder: 'rgba(100, 116, 139, 0.35)' };
}

export function InAppNewsReaderModal({ article, isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useBackHandler(() => {
    if (isOpen) {
      onClose();
      return true;
    }
    return false;
  }, isOpen, 90);

  useEffect(() => {
    if (!isOpen || !article) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const initialParas = Array.isArray(article.paragraphs) && article.paragraphs.length > 0
      ? article.paragraphs
      : (article.body || article.summary || article.description
          ? [String(article.body || article.summary || article.description).replace(/<[^>]+>/g, '').trim()]
          : []);

    setDetail({
      title: article.title || article.headline || 'Market Announcement',
      date: article.date || article.pubDate || article.triggeredAt || 'Recent',
      source: article.source || 'Financial News',
      url: article.url || article.link || '',
      image: article.image || null,
      symbol: article.symbol || '',
      type: article.type || 'NEWS_ALERT',
      paragraphs: initialParas
    });

    const targetUrl = article.url || article.link || '';
    if (!targetUrl || !targetUrl.startsWith('http')) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetchNewsArticle(targetUrl)
      .then((res) => {
        if (!isMounted) return;
        const d = res?.data || res;
        if (d && (d.paragraphs || d.content)) {
          setDetail((prev) => ({
            ...prev,
            title: d.title || prev?.title,
            date: d.date || prev?.date,
            source: d.source || prev?.source,
            image: d.image || prev?.image,
            paragraphs: Array.isArray(d.paragraphs) && d.paragraphs.length > 0 ? d.paragraphs : prev?.paragraphs
          }));
        }
      })
      .catch((err) => {
        console.warn('[InAppNewsReader] Failed fetching full story:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, article]);

  if (!isOpen || !article) return null;

  const currentDetail = detail || article;
  const meta = getSourceMeta(currentDetail.source);
  const paragraphs = Array.isArray(currentDetail.paragraphs) && currentDetail.paragraphs.length > 0
    ? currentDetail.paragraphs
    : (currentDetail.body ? [currentDetail.body] : ['No extended story paragraphs available.']);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: currentDetail.title,
          text: currentDetail.title,
          url: currentDetail.url || window.location.href,
        });
      }
    } catch (_) {}
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md animate-fadeIn transition-opacity"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-2xl shadow-black overflow-hidden animate-slideUp text-white"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-slate-800 sticky top-0 z-20">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700/80 transition active:scale-95 cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>बन्द गर्नुहोस् (Close)</span>
          </button>

          <div className="flex items-center gap-2">
            {typeof navigator !== 'undefined' && Boolean(navigator.share) && (
              <button
                type="button"
                onClick={handleShare}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition active:scale-95 cursor-pointer"
                title="Share news story"
              >
                <Share2 size={14} />
              </button>
            )}

            {currentDetail.url && (
              <a
                href={currentDetail.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition active:scale-95"
                title="Open original website"
              >
                <span>Original Link</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        {/* Scrollable Story Content */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
          {/* Metadata Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg border uppercase tracking-wider"
              style={{
                backgroundColor: meta.badgeBg,
                color: meta.badgeColor,
                borderColor: meta.badgeBorder
              }}
            >
              {meta.label}
            </span>

            {currentDetail.symbol && (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {currentDetail.symbol}
              </span>
            )}

            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar size={12} />
              <span>{currentDetail.date}</span>
            </span>

            {loading && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-cyan-400 animate-pulse ml-auto">
                <Loader2 size={11} className="animate-spin" />
                <span>Loading full text…</span>
              </span>
            )}
          </div>

          {/* Headline Title */}
          <h1 className="text-lg sm:text-xl font-black text-white leading-snug tracking-tight">
            {currentDetail.title}
          </h1>

          {/* Featured Image if available */}
          {currentDetail.image && (
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <img
                src={currentDetail.image}
                alt={currentDetail.title}
                className="w-full max-h-64 object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}

          {/* Story Body Paragraphs */}
          <div className="space-y-3.5 pt-2">
            {loading && paragraphs.length <= 1 ? (
              <div className="space-y-3 py-2">
                <div className="h-4 bg-slate-800 rounded animate-pulse w-full" />
                <div className="h-4 bg-slate-800 rounded animate-pulse w-11/12" />
                <div className="h-4 bg-slate-800 rounded animate-pulse w-4/5" />
                <div className="h-4 bg-slate-800 rounded animate-pulse w-full" />
              </div>
            ) : null}

            {paragraphs.map((p, idx) => {
              const text = String(p || '').trim();
              if (!text) return null;
              return (
                <p
                  key={idx}
                  className="text-slate-200 text-sm sm:text-base leading-relaxed font-normal selection:bg-blue-600 selection:text-white"
                >
                  {text}
                </p>
              );
            })}
          </div>

          {/* ShareHub parity footer note */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Newspaper size={13} />
              <span>Dravyashree In-App Reader (ShareHub Parity)</span>
            </span>
            <span>NEPSE Market Desk</span>
          </div>
        </div>
      </div>
    </div>
  );
}
