import React, { useState } from 'react';
import { Newspaper, Calendar, Globe, Plus, Sparkles, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { BlogPost } from '../../types';

const INITIAL_POSTS: BlogPost[] = [
  {
    id: 'post_1',
    slug: 'लोकमंगल-समूह-रौप्यमहोत्स',
    title: 'लोकमंगल समूह रौप्यमहोत्सवी वर्ष पदार्पण व सामाजिक उपक्रम',
    language: 'mr',
    category: 'News',
    author: 'Editorial Team',
    date: '2026-03-15',
    summary: 'लोकमंगल समूहाच्या २५ व्या वर्धापनदिनानिमित्त विविध सामाजिक व सहकार उपक्रमांचे आयोजन.',
    content: 'लोकमंगल समूहाने सहकार, शिक्षण व शेतकरी विकासात २५ वर्षे यशस्वीपणे पूर्ण केली आहेत...',
    status: 'published',
  },
  {
    id: 'post_2',
    slug: 'यशोगाथा-संचालक-सचिन-अडगळ',
    title: 'यशोगाथा: संचालक सचिन अडगळे यांच्या मार्गदर्शनाखाली प्रगती',
    language: 'mr',
    category: 'Success Story',
    author: 'Public Relations',
    date: '2026-02-28',
    summary: 'संस्थेच्या आर्थिक प्रगतीमध्ये संचालक मंडळाचे महत्त्वपूर्ण योगदान.',
    content: 'सहकारी संस्थेच्या वाढीत पारदर्शक कारभार आणि ग्राहकाभिमुख सेवा यांचा मोठा वाटा आहे...',
    status: 'published',
  },
  {
    id: 'post_3',
    slug: 'what-is-a-traimasik-interest-scheme',
    title: 'What is a Traimasik (Quarterly) Interest Deposit Scheme?',
    language: 'en',
    category: 'Financial Literacy',
    author: 'Finance Team',
    date: '2026-01-20',
    summary: 'Understanding quarterly compounding and payout benefits for senior citizen depositors.',
    content: 'Traimasik interest schemes provide regular liquidity without breaking principal capital...',
    status: 'published',
  },
  {
    id: 'post_4',
    slug: 'सोलापूर-शाखा-भोगावतीच्या',
    title: 'सोलापूर शाखा भोगावतीच्या शेतकरी मेळाव्यास उत्स्फूर्त प्रतिसाद',
    language: 'mr',
    category: 'Events',
    author: 'Branch Reporter',
    date: '2026-04-10',
    summary: 'शेतकऱ्यांसाठी पीककर्ज, कृषी अवजारे व ठेव योजनांची सविस्तर माहिती.',
    content: 'मेळाव्यात १०० हून अधिक शेतकरी बांधवांनी सहभाग नोंदवून योजनांचा लाभ घेतला...',
    status: 'published',
  },
];

export const PostsScreen: React.FC = () => {
  const { addToast } = useToast();
  const [posts, setPosts] = useState<BlogPost[]>(INITIAL_POSTS);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);

  const columns: Column<BlogPost>[] = [
    {
      key: 'title',
      header: 'Article Title',
      sortable: true,
      render: (p) => (
        <div>
          <span className="font-bold text-text-primary block line-clamp-1">{p.title}</span>
          <span className="text-[11px] text-text-secondary font-mono">{p.slug}</span>
        </div>
      ),
    },
    {
      key: 'language',
      header: 'Language',
      render: (p) => (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-canvas border border-border">
          {p.language === 'mr' ? 'मराठी' : 'English'}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (p) => <span className="text-xs text-text-secondary">{p.category}</span>,
    },
    {
      key: 'date',
      header: 'Display Date',
      sortable: true,
      render: (p) => <span className="text-xs text-text-secondary tabular-nums">{p.date}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPost(p);
          }}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Edit Post
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog & News Articles (बातम्या व लेख)"
        description="Public news, customer success stories and cooperative banking articles."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand-primary border border-brand/20">
            54 Articles
          </span>
        }
      />

      <DataTable
        data={posts}
        columns={columns}
        keyExtractor={(p) => p.id}
        searchKey={(p) => `${p.title} ${p.slug} ${p.category}`}
        searchPlaceholder="Search news articles..."
        onRowClick={(p) => setSelectedPost(p)}
      />

      <Drawer
        isOpen={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        title={selectedPost?.title || 'Edit Article'}
        subtitle={`Category: ${selectedPost?.category} · Display Date: ${selectedPost?.date}`}
        size="lg"
        footer={
          <button
            onClick={() => {
              addToast({
                type: 'success',
                title: 'Article Saved (Draft)',
                message: 'Post draft saved. Ready for release preview.',
              });
              setSelectedPost(null);
            }}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-xs transition-colors"
          >
            Save Draft Post
          </button>
        }
      >
        {selectedPost && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-text-secondary block mb-1">Headline / Title</label>
              <input
                type="text"
                value={selectedPost.title}
                onChange={(e) => setSelectedPost({ ...selectedPost, title: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-bold text-text-primary text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Category</label>
                <input
                  type="text"
                  value={selectedPost.category}
                  onChange={(e) => setSelectedPost({ ...selectedPost, category: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Display Date</label>
                <input
                  type="date"
                  value={selectedPost.date}
                  onChange={(e) => setSelectedPost({ ...selectedPost, date: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-text-secondary block mb-1">Short Summary / Excerpt</label>
              <textarea
                rows={3}
                value={selectedPost.summary}
                onChange={(e) => setSelectedPost({ ...selectedPost, summary: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary leading-relaxed"
              />
            </div>

            <div>
              <label className="font-bold text-text-secondary block mb-1">Article Body Content</label>
              <textarea
                rows={8}
                value={selectedPost.content}
                onChange={(e) => setSelectedPost({ ...selectedPost, content: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control text-text-primary font-mono text-xs leading-relaxed"
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
