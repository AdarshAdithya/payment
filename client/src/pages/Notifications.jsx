import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { timeAgo } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, Header, Spinner } from '../components/ui.jsx';

const ICON = { credit: 'request', request: 'chat', reward: 'gift', bill: 'bolt' };

export default function Notifications() {
  const { data } = useApi('/notifications');
  const { refresh } = useAuth();
  useEffect(() => { if (data) post('/notifications/read').then(refresh).catch(() => {}); }, [data, refresh]);
  return (
    <div className="screen">
      <Header title="Notifications" />
      {!data ? <Spinner /> : data.notifications.length === 0 ? <Empty icon="bell" title="You're all caught up" /> : (
        <section className="card card--flat"><div className="list">
          {data.notifications.map((n) => (
            <Link key={n.id} to={n.link || '/'} className={`row ${n.read ? '' : 'row--unread'}`}>
              <span className="source__icon"><Icon name={ICON[n.type] || 'bell'} size={18} /></span>
              <div className="row__main"><strong>{n.title}</strong><span className="muted">{n.body} · {timeAgo(n.createdAt)}</span></div>
            </Link>
          ))}
        </div></section>
      )}
    </div>
  );
}
