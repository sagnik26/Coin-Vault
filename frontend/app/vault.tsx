'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = '/api/v1';
const USER_KEY = 'coinVaultUserId';
const NAME_KEY = 'coinVaultDisplayName';
const NOTICE_KEY = 'coinVaultNotice';

type CoinPack = { id: string; name: string; coins: number; price_cents: number };
type Product = {
  id: string;
  name: string;
  category: string;
  price_coins: number;
  is_consumable: boolean;
};
type Transaction = {
  id: number;
  delta: number;
  balance_after: number;
  type: 'top_up' | 'purchase';
  created_at: string;
};
type InventoryItem = { product_id: string; name: string; category: string; purchased_at: string };
type CreatedUser = { id: string; display_name: string; email: string; balance: number };
type ExistingUser = { id: string; display_name: string; email: string | null; balance: number };
type PendingTopUp = { id: string; coins: number };
type ConfirmedTopUp = { balance: number };
type PurchaseResult = { balance_after: number };
type Page<T> = { items: T[]; next_cursor: string | null };

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const FILTERS = [
  { category: '', label: 'All' },
  { category: 'skin', label: 'Skins' },
  { category: 'emote', label: 'Emotes' },
  { category: 'battle_pass', label: 'Battle passes' },
];

function userId(): string | null {
  return localStorage.getItem(USER_KEY);
}

function needsUser(path: string): boolean {
  return path.startsWith('/me') || path.startsWith('/purchases') || path.startsWith('/top-ups');
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rem = String(cents % 100).padStart(2, '0');
  return `$${dollars}.${rem}`;
}

function signedCoins(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function categoryLabel(category: string): string {
  return category.replace('_', ' ');
}

function NoticeModal({
  message,
  kind,
  onClose,
}: {
  message: string;
  kind: 'ok' | 'error';
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const suppressClose = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    function handleClose() {
      // close() notifies later. A reopen in the same turn must ignore that notice.
      if (suppressClose.current) {
        suppressClose.current = false;
        return;
      }
      onCloseRef.current();
    }
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) {
        suppressClose.current = true;
        dialog.close();
      }
    };
  }, []);

  function dismiss() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="notice"
      data-kind={kind}
      role={kind === 'error' ? 'alertdialog' : 'dialog'}
      aria-labelledby="notice-title"
      aria-describedby="notice-text"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          dismiss();
        }
      }}
    >
      <div className="notice-body">
        <p id="notice-title" className="notice-kicker">{kind === 'error' ? 'Notice' : 'Done'}</p>
        <p id="notice-text" className="notice-text">{message}</p>
        <button type="button" onClick={dismiss}>OK</button>
      </div>
    </dialog>
  );
}

async function api<T>(path: string, options: { method?: string; body?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const id = userId();
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (needsUser(path) && id) {
    headers['X-User-Id'] = id;
  }

  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });
  const payload = await response.json().catch(() => ({})) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new ApiError(payload.error?.message || 'Request failed', response.status, payload.error?.code);
  }
  return payload;
}

export function HomeScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'ok' | 'error'>('error');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([]);
  const [creating, setCreating] = useState(false);
  const [ready, setReady] = useState(false);

  function showMessage(text: string, kind: 'ok' | 'error' = 'error') {
    setMessage(text);
    setMessageKind(kind);
  }

  useEffect(() => {
    let cancelled = false;
    const notice = sessionStorage.getItem(NOTICE_KEY);
    if (notice) {
      sessionStorage.removeItem(NOTICE_KEY);
      showMessage(notice);
    }
    async function load() {
      try {
        const data = await api<{ items: ExistingUser[] }>('/users');
        if (!cancelled) {
          setExistingUsers(data.items);
        }
      } catch (err) {
        if (!cancelled) {
          showMessage(errorText(err));
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    showMessage('');
    try {
      const user = await api<CreatedUser>('/users', {
        method: 'POST',
        body: JSON.stringify({ display_name: displayName, email }),
      });
      localStorage.setItem(USER_KEY, user.id);
      localStorage.setItem(NAME_KEY, user.display_name);
      router.push('/vault');
    } catch (err) {
      showMessage(errorText(err));
      setCreating(false);
    }
  }

  function onContinue(user: ExistingUser) {
    localStorage.setItem(USER_KEY, user.id);
    localStorage.setItem(NAME_KEY, user.display_name);
    router.push('/vault');
  }

  return (
    <>
      <header>
        <div>
          <h1>Coin Vault</h1>
          <p className="lede">Gold coins for skins, emotes, and battle passes.</p>
        </div>
      </header>
      <main>
        {message ? <NoticeModal message={message} kind={messageKind} onClose={() => showMessage('')} /> : null}
        {ready ? (
          <>
            <section className="panel">
              <h2>Use an existing user</h2>
              <p className="lede">Pick someone already in the vault. Back from their page returns here.</p>
              {existingUsers.length === 0 ? <p className="empty">No users yet.</p> : null}
              <div className="list">
                {existingUsers.map((user) => (
                  <button className="user-choice" key={user.id} type="button" onClick={() => onContinue(user)}>
                    <strong>{user.display_name}</strong>
                    <span className="meta">{user.email ? user.email : 'No email on file'} · {user.balance} coins</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>Create a user</h2>
              <p className="lede">A display name and an email. The email has to be new.</p>
              <form onSubmit={onCreate}>
                <label className="meta" htmlFor="display-name">Display name</label>
                <input
                  id="display-name"
                  name="display_name"
                  maxLength={60}
                  required
                  autoComplete="nickname"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <label className="meta" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  maxLength={254}
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <button type="submit" disabled={creating}>Create user</button>
              </form>
            </section>
          </>
        ) : <p className="lede">Loading…</p>}
      </main>
    </>
  );
}

export function VaultScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'ok' | 'error'>('error');
  const [greeting, setGreeting] = useState('Catalog');
  const [balance, setBalance] = useState<number | null>(null);
  const [packs, setPacks] = useState<CoinPack[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [category, setCategory] = useState('');
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextCursor = useRef<string | null>(null);
  const categoryRef = useRef('');

  function showMessage(text: string, kind: 'ok' | 'error' = 'error') {
    setMessage(text);
    setMessageKind(kind);
  }

  async function loadPacks() {
    const data = await api<{ items: CoinPack[] }>('/coin-packs');
    setPacks(data.items);
  }

  async function loadProducts() {
    const selected = categoryRef.current;
    const path = selected ? `/products?category=${encodeURIComponent(selected)}` : '/products';
    const data = await api<{ items: Product[] }>(path);
    setProducts(data.items);
  }

  async function loadTransactions(reset: boolean) {
    const params = new URLSearchParams({ limit: '20' });
    if (!reset && nextCursor.current) {
      params.set('cursor', nextCursor.current);
    }
    const data = await api<Page<Transaction>>(`/me/transactions?${params.toString()}`);
    nextCursor.current = data.next_cursor;
    setHasMore(Boolean(data.next_cursor));
    setTransactions((current) => (reset ? data.items : [...current, ...data.items]));
  }

  async function loadInventory() {
    const data = await api<{ items: InventoryItem[] }>('/me/inventory');
    setInventory(data.items);
  }

  async function refreshBalance() {
    const data = await api<{ balance: number }>('/me/balance');
    setBalance(data.balance);
  }

  async function showApp() {
    const name = localStorage.getItem(NAME_KEY);
    setGreeting(name ? name : 'Your vault');
    await refreshBalance();
    await Promise.all([loadPacks(), loadProducts(), loadTransactions(true), loadInventory()]);
    setReady(true);
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!userId()) {
        router.replace('/');
        return;
      }
      try {
        await showApp();
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 404 && err.code === 'user_not_found') {
          localStorage.removeItem(USER_KEY);
          localStorage.removeItem(NAME_KEY);
          sessionStorage.setItem(NOTICE_KEY, 'That user no longer exists. Choose another or create one.');
          router.replace('/');
          return;
        }
        showMessage(errorText(err));
        setReady(true);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
    // Load the user stored before this route was opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFilter(next: string) {
    categoryRef.current = next;
    setCategory(next);
    try {
      await loadProducts();
    } catch (err) {
      showMessage(errorText(err));
    }
  }

  async function buyPack(pack: CoinPack) {
    setBusyId(pack.id);
    showMessage('');
    try {
      const pending = await api<PendingTopUp>('/top-ups', {
        method: 'POST',
        body: JSON.stringify({ coin_pack_id: pack.id }),
      });
      const confirmed = await api<ConfirmedTopUp>(`/top-ups/${pending.id}/confirm`, { method: 'POST' });
      setBalance(confirmed.balance);
      showMessage(`Added ${pending.coins} coins. Balance is ${confirmed.balance}.`, 'ok');
      await Promise.all([loadTransactions(true), loadInventory()]);
    } catch (err) {
      showMessage(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  async function buyProduct(product: Product) {
    setBusyId(product.id);
    showMessage('');
    try {
      const result = await api<PurchaseResult>('/purchases', {
        method: 'POST',
        body: JSON.stringify({ product_id: product.id }),
      });
      setBalance(result.balance_after);
      showMessage(`Bought ${product.name}. Balance is ${result.balance_after}.`, 'ok');
      await Promise.all([loadTransactions(true), loadInventory()]);
    } catch (err) {
      showMessage(errorText(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onLoadMore() {
    setLoadingMore(true);
    try {
      await loadTransactions(false);
    } catch (err) {
      showMessage(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <header>
        <div>
          <h1>Coin Vault</h1>
          <p className="lede">Gold coins for skins, emotes, and battle passes.</p>
        </div>
        {balance !== null ? <div className="balance">{balance} coins</div> : null}
      </header>
      <main>
        {message ? <NoticeModal message={message} kind={messageKind} onClose={() => showMessage('')} /> : null}

        {ready ? (
          <>
            <section className="panel">
              <div className="heading-row">
                <h2>{greeting}</h2>
                <button className="ghost" type="button" onClick={() => router.push('/')}>Back</button>
              </div>
            </section>

            <section className="panel">
              <h2>Coin packs</h2>
              <div className="grid">
                {packs.map((pack) => (
                  <article className="card" key={pack.id}>
                    <strong>{pack.name}</strong>
                    <p className="meta">{pack.coins} coins</p>
                    <p className="meta">{formatCents(pack.price_cents)}</p>
                    <button type="button" disabled={busyId === pack.id} onClick={() => buyPack(pack)}>Buy</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>Products</h2>
              <div className="filters">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.label}
                    type="button"
                    aria-pressed={category === filter.category}
                    onClick={() => onFilter(filter.category)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="grid">
                {products.length === 0 ? <p className="empty">No products in this category.</p> : null}
                {products.map((product) => (
                  <article className="card" key={product.id}>
                    <strong>{product.name}</strong>
                    <p className="meta">
                      {categoryLabel(product.category)} · {product.is_consumable ? 'Consumable' : 'One-time'}
                    </p>
                    <p className="meta">{product.price_coins} coins</p>
                    <button type="button" disabled={busyId === product.id} onClick={() => buyProduct(product)}>Buy</button>
                  </article>
                ))}
              </div>
            </section>

            <div className="split">
              <section className="panel">
                <h2>Transactions</h2>
                <div className="list">
                  {transactions.length === 0 ? <p className="empty">No transactions yet.</p> : null}
                  {transactions.map((item) => (
                    <div className="row" key={item.id}>
                      <div>
                        <strong>{item.type === 'top_up' ? 'Top-up' : 'Purchase'}</strong>
                        <div className="meta">{new Date(item.created_at).toLocaleString()}</div>
                      </div>
                      <strong className={item.delta > 0 ? 'delta-pos' : 'delta-neg'}>{signedCoins(item.delta)}</strong>
                    </div>
                  ))}
                </div>
                {hasMore ? (
                  <button className="load-more" type="button" disabled={loadingMore} onClick={onLoadMore}>
                    Load more
                  </button>
                ) : null}
              </section>
              <section className="panel">
                <h2>Inventory</h2>
                <div className="list">
                  {inventory.length === 0 ? <p className="empty">No one-time items yet.</p> : null}
                  {inventory.map((item) => (
                    <div className="row" key={item.product_id}>
                      <div>
                        <strong>{item.name}</strong>
                        <div className="meta">{categoryLabel(item.category)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : <p className="lede">Loading…</p>}
      </main>
    </>
  );
}
