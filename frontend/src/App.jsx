import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Download,
  Ellipsis,
  FileJson,
  HandCoins,
  Home,
  Landmark,
  LockKeyhole,
  Menu,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  buildActivity,
  currencyScale,
  downloadText,
  equalAllocation,
  formatDate,
  formatMoney,
  initials,
  percentageDefaults,
  splitPreview,
  toMinorUnits,
} from "./domain.js";
import { applyPwaMetadata, isIosDevice, isStandaloneMode } from "./pwa.js";

const NAVIGATION = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "expenses", label: "Expenses", icon: ReceiptText },
  { id: "settle", label: "Settle up", icon: HandCoins },
  { id: "people", label: "People & groups", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

const CATEGORY_ICONS = {
  "Food & drink": "🍜",
  Travel: "✈️",
  Stay: "🏡",
  Transport: "🚕",
  Shopping: "🛍️",
  Entertainment: "🎬",
  Utilities: "💡",
  Health: "🩺",
  Other: "✨",
};

function fromMinorUnits(value, currency) {
  return Number(value || 0) / currencyScale(currency);
}

function useAction(sendAction, page, renderId) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [renderId]);

  const dispatch = (action) => {
    if (pending) return;
    setPending(true);
    sendAction({ ...action, view: page });
  };
  return [dispatch, pending];
}

function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const hostWindow = applyPwaMetadata(window);
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const eventWindows = new Set([window, hostWindow]);

    setInstalled(isStandaloneMode(hostWindow));
    setIos(isIosDevice(hostWindow.navigator));
    for (const eventWindow of eventWindows) {
      eventWindow.addEventListener("beforeinstallprompt", handleInstallPrompt);
      eventWindow.addEventListener("appinstalled", handleInstalled);
    }
    return () => {
      for (const eventWindow of eventWindows) {
        eventWindow.removeEventListener("beforeinstallprompt", handleInstallPrompt);
        eventWindow.removeEventListener("appinstalled", handleInstalled);
      }
    };
  }, []);

  const requestInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return {
    canInstall: Boolean(installPrompt),
    installed,
    ios,
    requestInstall,
  };
}

function Button({ children, variant = "primary", icon: Icon, className = "", ...props }) {
  return (
    <button className={`button button--${variant} ${className}`} {...props}>
      {Icon ? <Icon size={17} strokeWidth={2.2} /> : null}
      <span>{children}</span>
    </button>
  );
}

function Avatar({ name, size = "medium" }) {
  const hue = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5;
  return <span className={`avatar avatar--${size} avatar--tone-${hue}`}>{initials(name)}</span>;
}

function StatusPill({ children, tone = "neutral", icon: Icon }) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      {Icon ? <Icon size={14} /> : null}
      {children}
    </span>
  );
}

function EmptyState({ icon: Icon = Sparkles, title, body, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Icon size={25} /></span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children, size = "medium" }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Toast({ flash }) {
  if (!flash?.message) return null;
  return (
    <div className={`toast toast--${flash.kind || "success"}`} role="status">
      {flash.kind === "error" ? <X size={17} /> : <CheckCircle2 size={17} />}
      <span>{flash.message}</span>
    </div>
  );
}

function ErrorScreen({ data }) {
  return (
    <main className="error-screen">
      <section className="error-card" role="alert">
        <span className="error-card__icon"><X size={28} /></span>
        <span className="eyebrow">Ledger unavailable</span>
        <h1>FairShare could not open your data.</h1>
        <p>{data.message || "Check the database configuration and restart the app."}</p>
        <Button icon={RefreshCcw} onClick={() => window.location.reload()}>Try again</Button>
      </section>
    </main>
  );
}

function Sidebar({ data, page, setPage, mobileOpen, setMobileOpen, dispatch }) {
  const selectPage = (nextPage) => {
    setPage(nextPage);
    setMobileOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`sidebar-scrim ${mobileOpen ? "is-visible" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
      />
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar__brand">
          <div className="brand-mark"><HandCoins size={22} /></div>
          <div><strong>FairShare</strong><span>Less maths. More memories.</span></div>
          <button className="icon-button icon-button--dark sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>

        <label className="group-switcher">
          <span>Current space</span>
          <div>
            <span className="group-switcher__emoji">{data.group.emoji}</span>
            <select
              aria-label="Current group"
              value={data.group.id}
              onChange={(event) => dispatch({ type: "select_group", group_id: event.target.value })}
            >
              {data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>
        </label>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {NAVIGATION.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={page === id || (id === "expenses" && page === "add-expense") ? "is-active" : ""} onClick={() => selectPage(id)}>
              <Icon size={19} strokeWidth={2} />
              <span>{label}</span>
              {id === "expenses" && data.expenses.length ? <small>{data.expenses.length}</small> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar__card">
          <span className="sidebar__card-icon"><Sparkles size={17} /></span>
          <div><strong>{data.debts.length ? `${data.debts.length} payment${data.debts.length === 1 ? "" : "s"} to settle` : "You’re all square"}</strong><span>Balances update instantly.</span></div>
        </div>

        <div className="sidebar__footer">
          <span className="live-dot" />
          <div><strong>{data.storage.label}</strong><span>{data.storage.backend === "postgresql" ? "Cloud sync active" : "Stored on this Mac"}</span></div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ data, page, setPage, setMobileOpen, dispatch, pending }) {
  const pageName = page === "add-expense" ? "Add expense" : NAVIGATION.find((item) => item.id === page)?.label || "Overview";
  return (
    <header className="topbar">
      <button className="icon-button topbar__menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
      <div className="topbar__title"><span>{data.group.emoji} {data.group.name}</span><ArrowRight size={13} /><strong>{pageName}</strong></div>
      <div className="topbar__actions">
        <Button variant="ghost" icon={HandCoins} onClick={() => setPage("settle")}>Settle up</Button>
        <Button icon={Plus} aria-label="Add expense" disabled={pending} onClick={() => setPage("add-expense")}>Add expense</Button>
        <button className="avatar-button" type="button" onClick={() => setPage("people")} title="People and groups">
          <Avatar name={data.owner_name} size="small" />
        </button>
      </div>
    </header>
  );
}

function PageIntro({ eyebrow, title, body, action }) {
  return (
    <div className="page-intro">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div>
      {action ? <div className="page-intro__action">{action}</div> : null}
    </div>
  );
}

function BalanceCard({ member, amount, currency, ownerId }) {
  const positive = amount > 0;
  const negative = amount < 0;
  return (
    <article className="person-balance-card">
      <div className="person-balance-card__head">
        <Avatar name={member.name} />
        {member.id === ownerId ? <StatusPill tone="violet">You</StatusPill> : <button className="icon-button" type="button" aria-label={`More options for ${member.name}`}><Ellipsis size={18} /></button>}
      </div>
      <h3>{member.name}</h3>
      <span className={`balance-copy ${positive ? "is-positive" : negative ? "is-negative" : ""}`}>
        {positive ? "gets back" : negative ? "owes" : "all settled"}
      </span>
      <strong>{amount ? formatMoney(Math.abs(amount), currency) : "—"}</strong>
    </article>
  );
}

function ActivityRow({ item, onOpen }) {
  const icon = item.type === "settlement" ? "↗" : CATEGORY_ICONS[item.record.category] || "✨";
  return (
    <button className="activity-row" type="button" onClick={() => onOpen?.(item)}>
      <span className={`activity-row__icon activity-row__icon--${item.type}`}>{icon}</span>
      <span className="activity-row__copy"><strong>{item.title}</strong><small>{item.detail} · {formatDate(item.date)}</small></span>
      <span className="activity-row__amount">{formatMoney(item.amount_minor, item.currency)}</span>
      <ArrowRight size={16} className="activity-row__arrow" />
    </button>
  );
}

function SettlementPlan({ data, dispatch, pending, compact = false }) {
  const memberNames = Object.fromEntries(data.members.map((member) => [member.id, member.name]));
  if (!data.debts.length) {
    return <EmptyState icon={Check} title="Everything is settled" body="No one owes anything in this group right now." />;
  }
  return (
    <div className={`settlement-list ${compact ? "settlement-list--compact" : ""}`}>
      {data.debts.map((debt) => (
        <article className="settlement-row" key={`${debt.from_member_id}-${debt.to_member_id}`}>
          <div className="settlement-row__people">
            <Avatar name={memberNames[debt.from_member_id]} size="small" />
            <span><strong>{memberNames[debt.from_member_id]}</strong><small>pays {memberNames[debt.to_member_id]}</small></span>
          </div>
          <div className="settlement-row__value">
            <strong>{formatMoney(debt.amount_minor, data.group.currency)}</strong>
            <Button
              variant="soft"
              disabled={pending}
              onClick={() => dispatch({
                type: "add_settlement",
                group_id: data.group.id,
                from_member_id: debt.from_member_id,
                to_member_id: debt.to_member_id,
                amount: fromMinorUnits(debt.amount_minor, data.group.currency),
                currency: data.group.currency,
                settled_date: data.today,
                notes: "Suggested settlement",
              })}
            >Mark paid</Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function OverviewPage({ data, setPage, dispatch, pending }) {
  const activity = useMemo(() => buildActivity(data.expenses, data.settlements), [data.expenses, data.settlements]);
  const ownerBalance = data.balances.find((balance) => balance.member_id === data.owner_id)?.amount_minor || 0;
  const maxCategoryAmount = Math.max(1, ...data.category_totals.map((item) => item.amount_minor));

  return (
    <>
      <PageIntro
        eyebrow="Group pulse"
        title="The money picture"
        body="A calm, honest view of what was spent and what still needs settling."
        action={<StatusPill tone={data.debts.length ? "coral" : "green"} icon={data.debts.length ? TrendingUp : CheckCircle2}>{data.debts.length ? "Action needed" : "All settled"}</StatusPill>}
      />

      <section className="hero-balance">
        <div className="hero-balance__copy">
          <span>Your position</span>
          <strong className={ownerBalance < 0 ? "is-negative" : ""}>{formatMoney(ownerBalance, data.group.currency, true)}</strong>
          <p>{ownerBalance > 0 ? "You’re owed money across this group." : ownerBalance < 0 ? "You have a balance to settle." : "You’re perfectly even with everyone."}</p>
        </div>
        <div className="hero-balance__art" aria-hidden="true">
          <span className="coin coin--one">{data.group.currency === "INR" ? "₹" : data.group.currency.slice(0, 1)}</span>
          <span className="coin coin--two"><Check size={22} /></span>
          <span className="hero-balance__line" />
        </div>
        <div className="hero-balance__actions">
          <Button icon={Plus} onClick={() => setPage("add-expense")}>Add expense</Button>
          <Button variant="light" icon={HandCoins} onClick={() => setPage("settle")}>Settle up</Button>
        </div>
      </section>

      <section className="metric-grid">
        <article><span className="metric-icon metric-icon--violet"><WalletCards size={19} /></span><div><small>Total group spend</small><strong>{formatMoney(data.totals.total_spend, data.group.currency)}</strong></div></article>
        <article><span className="metric-icon metric-icon--coral"><ArrowUpRight size={19} /></span><div><small>Still to settle</small><strong>{formatMoney(data.totals.unsettled, data.group.currency)}</strong></div></article>
        <article><span className="metric-icon metric-icon--mint"><Users size={19} /></span><div><small>People</small><strong>{data.members.length}</strong></div></article>
        <article><span className="metric-icon metric-icon--amber"><ReceiptText size={19} /></span><div><small>Ledger entries</small><strong>{data.expenses.length + data.settlements.length}</strong></div></article>
      </section>

      {!activity.length ? (
        <EmptyState
          icon={ReceiptText}
          title="Start with the first shared expense"
          body="Add a dinner, taxi, stay, or any group cost. FairShare will handle the balance maths."
          action={<Button icon={Plus} onClick={() => setPage("add-expense")}>Add first expense</Button>}
        />
      ) : (
        <>
          <section className="section-block">
            <div className="section-heading"><div><span className="eyebrow">Balances</span><h2>Everyone at a glance</h2></div><button type="button" onClick={() => setPage("people")}>Manage people <ArrowRight size={15} /></button></div>
            <div className="people-balance-grid">
              {data.members.map((member) => {
                const amount = data.balances.find((balance) => balance.member_id === member.id)?.amount_minor || 0;
                return <BalanceCard key={member.id} member={member} amount={amount} currency={data.group.currency} ownerId={data.owner_id} />;
              })}
            </div>
          </section>

          <section className="overview-columns">
            <article className="panel">
              <div className="section-heading section-heading--inside"><div><span className="eyebrow">Next move</span><h2>Simplest settlement</h2></div><CircleDollarSign size={21} /></div>
              <SettlementPlan data={data} dispatch={dispatch} pending={pending} compact />
            </article>
            <article className="panel">
              <div className="section-heading section-heading--inside"><div><span className="eyebrow">Spending mix</span><h2>By category</h2></div><BarChart3 size={21} /></div>
              <div className="category-bars">
                {data.category_totals.length ? data.category_totals.slice(0, 5).map((category) => (
                  <div className="category-bar" key={category.category}>
                    <div><span>{CATEGORY_ICONS[category.category] || "✨"} {category.category}</span><strong>{formatMoney(category.amount_minor, data.group.currency)}</strong></div>
                    <span className="category-bar__track"><span style={{ width: `${Math.max(8, (category.amount_minor / maxCategoryAmount) * 100)}%` }} /></span>
                  </div>
                )) : <p className="muted-copy">Categories appear after the first expense.</p>}
              </div>
            </article>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><span className="eyebrow">Latest</span><h2>Recent activity</h2></div><button type="button" onClick={() => setPage("expenses")}>View ledger <ArrowRight size={15} /></button></div>
            <div className="activity-list">{activity.slice(0, 5).map((item) => <ActivityRow key={`${item.type}-${item.id}`} item={item} onOpen={() => setPage("expenses")} />)}</div>
          </section>
        </>
      )}
    </>
  );
}

function TogglePerson({ member, checked, onChange }) {
  return (
    <label className={`person-toggle ${checked ? "is-selected" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <Avatar name={member.name} size="small" />
      <span>{member.name}</span>
      <span className="person-toggle__check"><Check size={13} /></span>
    </label>
  );
}

function AddExpensePage({ data, dispatch, pending }) {
  const memberIds = data.members.map((member) => member.id);
  const memberNames = Object.fromEntries(data.members.map((member) => [member.id, member.name]));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(memberIds.includes(data.owner_id) ? data.owner_id : memberIds[0] || "");
  const [expenseDate, setExpenseDate] = useState(data.today);
  const [category, setCategory] = useState(data.categories[0]);
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("equal");
  const [participants, setParticipants] = useState(memberIds);
  const [splitValues, setSplitValues] = useState({});

  const amountMinor = toMinorUnits(amount, data.group.currency);
  const preview = splitPreview(amount, data.group.currency, participants, method, splitValues);
  const previewTotal = Object.values(preview).reduce((sum, value) => sum + value, 0);
  const percentagesTotal = participants.reduce((sum, memberId) => sum + (Number(splitValues[memberId]) || 0), 0);

  const chooseMethod = (nextMethod) => {
    setMethod(nextMethod);
    if (nextMethod === "percentage") setSplitValues(percentageDefaults(participants));
    else if (nextMethod === "shares") setSplitValues(Object.fromEntries(participants.map((memberId) => [memberId, 1])));
    else if (nextMethod === "exact") {
      const allocations = equalAllocation(amountMinor, participants);
      setSplitValues(Object.fromEntries(participants.map((memberId) => [memberId, fromMinorUnits(allocations[memberId] || 0, data.group.currency)])));
    } else setSplitValues({});
  };

  const toggleParticipant = (memberId, selected) => {
    const nextParticipants = selected ? [...participants, memberId] : participants.filter((id) => id !== memberId);
    setParticipants(nextParticipants);
    if (method === "percentage") setSplitValues(percentageDefaults(nextParticipants));
    else if (method === "shares") setSplitValues(Object.fromEntries(nextParticipants.map((id) => [id, splitValues[id] || 1])));
  };

  const submit = (event) => {
    event.preventDefault();
    dispatch({
      type: "add_expense",
      group_id: data.group.id,
      description,
      amount,
      currency: data.group.currency,
      paid_by_member_id: paidBy,
      expense_date: expenseDate,
      category,
      notes,
      split_method: method,
      participant_ids: participants,
      split_values: splitValues,
    });
  };

  if (data.members.length < 2) {
    return <EmptyState icon={UserPlus} title="Add another person first" body="A shared expense needs at least two people in this group." />;
  }

  return (
    <>
      <PageIntro eyebrow="New ledger entry" title="Add an expense" body="Capture it once. FairShare handles every share and balance from here." />
      <form className="expense-layout" onSubmit={submit}>
        <section className="form-card">
          <div className="form-card__heading"><span className="step-number">1</span><div><h2>Expense details</h2><p>What happened and who covered it?</p></div></div>
          <label className="field"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Dinner at Toit" maxLength={120} required /></label>
          <div className="amount-field">
            <span>{data.group.currency}</span>
            <input type="number" inputMode="decimal" min="0" step={data.group.currency === "JPY" ? "1" : "0.01"} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
          </div>
          <div className="field-grid">
            <label className="field"><span>Paid by</span><select value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label className="field"><span>Date</span><input type="date" max={data.today} value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required /></label>
          </div>
          <label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{data.categories.map((item) => <option key={item} value={item}>{CATEGORY_ICONS[item]} {item}</option>)}</select></label>
          <label className="field"><span>Note <small>optional</small></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add any useful context" maxLength={500} rows={3} /></label>
        </section>

        <section className="form-card form-card--split">
          <div className="form-card__heading"><span className="step-number">2</span><div><h2>Choose the split</h2><p>Flexible enough for every kind of group.</p></div></div>
          <div className="segmented-control" role="radiogroup" aria-label="Split method">
            {[{ id: "equal", label: "Equal" }, { id: "exact", label: "Exact" }, { id: "percentage", label: "%" }, { id: "shares", label: "Shares" }].map((item) => (
              <button key={item.id} type="button" className={method === item.id ? "is-active" : ""} onClick={() => chooseMethod(item.id)}>{item.label}</button>
            ))}
          </div>
          <span className="field-label">Included people</span>
          <div className="person-toggle-grid">
            {data.members.map((member) => <TogglePerson key={member.id} member={member} checked={participants.includes(member.id)} onChange={(checked) => toggleParticipant(member.id, checked)} />)}
          </div>

          {method !== "equal" && participants.length ? (
            <div className="split-inputs">
              {participants.map((memberId) => (
                <label className="split-input" key={memberId}>
                  <span><Avatar name={memberNames[memberId]} size="tiny" /> {memberNames[memberId]}</span>
                  <div>
                    {method === "exact" ? <small>{data.group.currency}</small> : null}
                    <input
                      type="number"
                      min="0"
                      step={method === "shares" ? "0.5" : "0.01"}
                      value={splitValues[memberId] ?? ""}
                      onChange={(event) => setSplitValues((current) => ({ ...current, [memberId]: event.target.value }))}
                    />
                    {method === "percentage" ? <small>%</small> : null}
                  </div>
                </label>
              ))}
              {method === "percentage" ? <p className={`split-total ${Math.abs(percentagesTotal - 100) < 0.02 ? "is-valid" : ""}`}>{percentagesTotal.toFixed(2)}% of 100%</p> : null}
            </div>
          ) : null}

          <div className="split-preview">
            <div><span>Split preview</span><strong>{formatMoney(amountMinor, data.group.currency)}</strong></div>
            {participants.length && amountMinor ? participants.map((memberId) => (
              <div className="split-preview__person" key={memberId}><span>{memberNames[memberId]}</span><strong>{formatMoney(preview[memberId] || 0, data.group.currency)}</strong></div>
            )) : <p>Add an amount and select people to preview the split.</p>}
            {method === "exact" && previewTotal !== amountMinor ? <p className="form-error">Exact amounts differ by {formatMoney(previewTotal - amountMinor, data.group.currency, true)}.</p> : null}
          </div>
          <Button type="submit" icon={Check} disabled={pending || !description || !amountMinor || !participants.length}>{pending ? "Saving…" : "Save expense"}</Button>
        </section>
      </form>
    </>
  );
}

function ExpensesPage({ data, dispatch, pending }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const activity = useMemo(() => buildActivity(data.expenses, data.settlements), [data.expenses, data.settlements]);
  const filtered = activity.filter((item) => {
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    const matchesQuery = `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase());
    return matchesType && matchesQuery;
  });

  return (
    <>
      <PageIntro
        eyebrow="Complete history"
        title="Expenses & activity"
        body="Every shared cost and settlement, with enough detail to stay trustworthy."
        action={<Button variant="ghost" icon={Trash2} onClick={() => setShowTrash(true)}>Trash <span className="button-count">{data.deleted_activity.length}</span></Button>}
      />
      <div className="ledger-toolbar">
        <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search description, person, category…" /></label>
        <div className="filter-pills">
          {[{ id: "all", label: "All" }, { id: "expense", label: "Expenses" }, { id: "settlement", label: "Settlements" }].map((filter) => <button key={filter.id} className={typeFilter === filter.id ? "is-active" : ""} onClick={() => setTypeFilter(filter.id)}>{filter.label}</button>)}
        </div>
      </div>
      <section className="ledger-card">
        <div className="ledger-card__head"><span>{filtered.length} entr{filtered.length === 1 ? "y" : "ies"}</span><span>{formatMoney(data.totals.total_spend, data.group.currency)} total spend</span></div>
        {filtered.length ? filtered.map((item) => <ActivityRow key={`${item.type}-${item.id}`} item={item} onOpen={setSelectedItem} />) : <EmptyState icon={Search} title="Nothing found" body="Try another search or filter." />}
      </section>

      {selectedItem ? (
        <Modal title={selectedItem.title} eyebrow={selectedItem.type === "expense" ? "Expense details" : "Settlement details"} onClose={() => setSelectedItem(null)}>
          <div className="detail-amount"><span>{formatDate(selectedItem.date)}</span><strong>{formatMoney(selectedItem.amount_minor, selectedItem.currency)}</strong></div>
          {selectedItem.type === "expense" ? (
            <>
              <dl className="detail-list"><div><dt>Paid by</dt><dd>{selectedItem.record.paid_by_name}</dd></div><div><dt>Category</dt><dd>{CATEGORY_ICONS[selectedItem.record.category]} {selectedItem.record.category}</dd></div><div><dt>Split method</dt><dd>{selectedItem.record.split_method}</dd></div></dl>
              <h3 className="modal-section-title">Shared by</h3>
              <div className="split-detail-list">{selectedItem.record.splits.map((split) => <div key={split.member_id}><span><Avatar name={split.member_name} size="tiny" /> {split.member_name}</span><strong>{formatMoney(split.amount_minor, selectedItem.currency)}</strong></div>)}</div>
            </>
          ) : <dl className="detail-list"><div><dt>From</dt><dd>{selectedItem.record.from_name}</dd></div><div><dt>To</dt><dd>{selectedItem.record.to_name}</dd></div></dl>}
          {selectedItem.record.notes ? <div className="detail-note"><span>Note</span><p>{selectedItem.record.notes}</p></div> : null}
          <div className="modal__footer"><Button variant="danger" icon={Trash2} disabled={pending} onClick={() => dispatch({ type: "delete", record_type: selectedItem.type, record_id: selectedItem.id })}>Move to trash</Button><Button variant="ghost" onClick={() => setSelectedItem(null)}>Close</Button></div>
        </Modal>
      ) : null}

      {showTrash ? (
        <Modal title="Trash & recovery" eyebrow="Nothing is lost by accident" onClose={() => setShowTrash(false)}>
          {data.deleted_activity.length ? <div className="trash-list">{data.deleted_activity.map((item) => (
            <article key={`${item.type}-${item.id}`}><span className="activity-row__icon"><Trash2 size={17} /></span><div><strong>{item.title}</strong><small>{formatDate(item.date)} · {formatMoney(item.amount_minor, item.currency)}</small></div><Button variant="soft" icon={RefreshCcw} disabled={pending} onClick={() => dispatch({ type: "restore", record_type: item.type, record_id: item.id })}>Restore</Button></article>
          ))}</div> : <EmptyState icon={Trash2} title="Trash is empty" body="Deleted expenses and settlements remain recoverable here." />}
        </Modal>
      ) : null}
    </>
  );
}

function SettlePage({ data, dispatch, pending }) {
  const memberNames = Object.fromEntries(data.members.map((member) => [member.id, member.name]));
  const defaultDebt = data.debts[0];
  const [fromMemberId, setFromMemberId] = useState(defaultDebt?.from_member_id || data.members[0]?.id || "");
  const [toMemberId, setToMemberId] = useState(defaultDebt?.to_member_id || data.members[1]?.id || "");
  const [amount, setAmount] = useState(defaultDebt ? fromMinorUnits(defaultDebt.amount_minor, data.group.currency) : "");
  const [settledDate, setSettledDate] = useState(data.today);
  const [notes, setNotes] = useState("");

  const submit = (event) => {
    event.preventDefault();
    dispatch({ type: "add_settlement", group_id: data.group.id, from_member_id: fromMemberId, to_member_id: toMemberId, amount, currency: data.group.currency, settled_date: settledDate, notes });
  };

  return (
    <>
      <PageIntro eyebrow="Close the loop" title="Settle without the guesswork" body="Use the shortest payment plan or record any custom payment." />
      <section className="settle-hero">
        <div><span className="eyebrow">Recommended plan</span><h2>{data.debts.length ? `${data.debts.length} payment${data.debts.length === 1 ? "" : "s"} clears the group` : "The group is perfectly even"}</h2><p>FairShare nets everyone’s balances to reduce unnecessary transfers.</p></div>
        <span className="settle-hero__icon"><HandCoins size={34} /></span>
      </section>
      <section className="settle-layout">
        <article className="panel panel--padded">
          <div className="section-heading section-heading--inside"><div><span className="eyebrow">Smart suggestions</span><h2>Who pays whom</h2></div></div>
          <SettlementPlan data={data} dispatch={dispatch} pending={pending} />
        </article>
        <form className="form-card" onSubmit={submit}>
          <div className="form-card__heading"><span className="step-number"><ArrowDownLeft size={17} /></span><div><h2>Custom payment</h2><p>Cash, UPI, or bank transfer.</p></div></div>
          <label className="field"><span>Paid by</span><select value={fromMemberId} onChange={(event) => setFromMemberId(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="field"><span>Paid to</span><select value={toMemberId} onChange={(event) => setToMemberId(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <div className="field-grid"><label className="field"><span>Amount ({data.group.currency})</span><input type="number" min="0" step={data.group.currency === "JPY" ? "1" : "0.01"} value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label className="field"><span>Date</span><input type="date" max={data.today} value={settledDate} onChange={(event) => setSettledDate(event.target.value)} /></label></div>
          <label className="field"><span>Note <small>optional</small></span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="UPI, cash, bank transfer…" /></label>
          <Button type="submit" icon={Check} disabled={pending || !amount || fromMemberId === toMemberId}>{pending ? "Recording…" : "Record payment"}</Button>
          {fromMemberId === toMemberId ? <p className="form-error">Choose two different people.</p> : null}
          {fromMemberId && toMemberId ? <p className="form-hint">{memberNames[fromMemberId]} pays {memberNames[toMemberId]}</p> : null}
        </form>
      </section>
    </>
  );
}

function PeoplePage({ data, dispatch, pending }) {
  const [tab, setTab] = useState("people");
  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupEmoji, setGroupEmoji] = useState("✨");
  const [groupCurrency, setGroupCurrency] = useState(data.group.currency);
  const [groupMembers, setGroupMembers] = useState([...new Set([data.owner_id, ...data.members.map((member) => member.id)])]);
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const membersInGroup = new Set(data.members.map((member) => member.id));
  const availableMembers = data.all_members.filter((member) => !membersInGroup.has(member.id));

  const addPerson = (event) => {
    event.preventDefault();
    dispatch({ type: "add_member", group_id: data.group.id, name: personName, email: personEmail });
  };
  const createGroup = (event) => {
    event.preventDefault();
    dispatch({ type: "add_group", name: groupName, emoji: groupEmoji, currency: groupCurrency, member_ids: groupMembers });
  };

  return (
    <>
      <PageIntro
        eyebrow="Your circle"
        title="People & groups"
        body="Reuse people across trips, homes, celebrations, and everyday life."
        action={<Button icon={tab === "people" ? UserPlus : Plus} onClick={() => tab === "people" ? setShowPersonForm(true) : setShowGroupForm(true)}>Add {tab === "people" ? "person" : "group"}</Button>}
      />
      <div className="page-tabs"><button className={tab === "people" ? "is-active" : ""} onClick={() => setTab("people")}>People</button><button className={tab === "groups" ? "is-active" : ""} onClick={() => setTab("groups")}>Groups</button></div>
      {tab === "people" ? (
        <>
          <section className="people-grid">
            {data.members.map((member) => {
              const balance = data.balances.find((item) => item.member_id === member.id)?.amount_minor || 0;
              return <article className="profile-card" key={member.id}><Avatar name={member.name} size="large" /><div><h3>{member.name}{member.id === data.owner_id ? <StatusPill tone="violet">You</StatusPill> : null}</h3><p>{member.email || "Group member"}</p></div><span className={balance > 0 ? "is-positive" : balance < 0 ? "is-negative" : ""}>{balance ? formatMoney(balance, data.group.currency, true) : "Settled"}</span></article>;
            })}
          </section>
          {availableMembers.length ? <section className="panel panel--padded add-existing"><div><h3>Add existing people</h3><p>Bring someone from your contact list into {data.group.name}.</p></div><div>{availableMembers.map((member) => <Button key={member.id} variant="soft" icon={Plus} disabled={pending} onClick={() => dispatch({ type: "add_members_to_group", group_id: data.group.id, member_ids: [member.id] })}>{member.name}</Button>)}</div></section> : null}
        </>
      ) : (
        <section className="groups-grid">
          {data.groups.map((group) => <button type="button" className={`group-card ${group.id === data.group.id ? "is-current" : ""}`} key={group.id} onClick={() => dispatch({ type: "select_group", group_id: group.id })}><span className="group-card__emoji">{group.emoji}</span><div><h3>{group.name}</h3><p>{group.member_count} member{group.member_count === 1 ? "" : "s"} · {group.currency}</p></div>{group.id === data.group.id ? <StatusPill tone="green" icon={Check}>Current</StatusPill> : <ArrowRight size={18} />}</button>)}
        </section>
      )}

      {showPersonForm ? <Modal title="Add a person" eyebrow={`Add to ${data.group.name}`} onClose={() => setShowPersonForm(false)}><form className="modal-form" onSubmit={addPerson}><label className="field"><span>Name</span><input autoFocus value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="Friend or family member" required /></label><label className="field"><span>Email <small>optional label</small></span><input type="email" value={personEmail} onChange={(event) => setPersonEmail(event.target.value)} placeholder="name@example.com" /></label><div className="modal__footer"><Button variant="ghost" type="button" onClick={() => setShowPersonForm(false)}>Cancel</Button><Button type="submit" icon={UserPlus} disabled={pending || !personName}>{pending ? "Adding…" : "Add person"}</Button></div></form></Modal> : null}

      {showGroupForm ? <Modal title="Create a group" eyebrow="A new shared space" size="large" onClose={() => setShowGroupForm(false)}><form className="modal-form" onSubmit={createGroup}><div className="field-grid"><label className="field"><span>Group name</span><input autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Goa trip" required /></label><label className="field"><span>Icon</span><select value={groupEmoji} onChange={(event) => setGroupEmoji(event.target.value)}>{["✨", "✈️", "🏡", "🍽️", "🎉", "🏕️", "🚗", "🎁"].map((emoji) => <option key={emoji}>{emoji}</option>)}</select></label></div><label className="field"><span>Currency</span><select value={groupCurrency} onChange={(event) => setGroupCurrency(event.target.value)}>{data.currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label><span className="field-label">Members</span><div className="person-toggle-grid">{data.all_members.map((member) => <TogglePerson key={member.id} member={member} checked={groupMembers.includes(member.id)} onChange={(checked) => setGroupMembers((current) => checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />)}</div><div className="modal__footer"><Button variant="ghost" type="button" onClick={() => setShowGroupForm(false)}>Cancel</Button><Button type="submit" icon={Plus} disabled={pending || !groupName || !groupMembers.length}>{pending ? "Creating…" : "Create group"}</Button></div></form></Modal> : null}
    </>
  );
}

function SettingsPage({ data, dispatch, pending, pwa }) {
  const fileSlug = data.group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
  return (
    <>
      <PageIntro eyebrow="Control & portability" title="Settings" body="Know where your data lives, protect access, and keep your own backup." />
      <section className="settings-grid">
        <article className="settings-card settings-card--accent"><span className="settings-card__icon"><Landmark size={22} /></span><div><span className="eyebrow">Storage</span><h2>{data.storage.label}</h2><p>{data.storage.backend === "postgresql" ? "Your ledger is connected to durable cloud PostgreSQL storage." : "Your ledger stays in a private SQLite file on this Mac."}</p><StatusPill tone="green" icon={CheckCircle2}>{data.storage.backend === "postgresql" ? "Cloud persistence active" : "Local-first mode"}</StatusPill></div></article>
        <article className="settings-card"><span className="settings-card__icon"><LockKeyhole size={22} /></span><div><span className="eyebrow">Access</span><h2>No app passcode</h2><p>Anyone who can reach this deployment can open and edit the shared ledger.</p><StatusPill tone="amber">Open access</StatusPill></div></article>
        <article className="settings-card settings-card--install"><span className="settings-card__icon"><Download size={22} /></span><div><span className="eyebrow">Progressive web app</span><h2>{pwa.installed ? "FairShare is installed" : "Install FairShare"}</h2><p>{pwa.installed ? "FairShare opens in its own app window from your home screen or app launcher." : "Add FairShare to your home screen or desktop for a focused, app-like experience. Your cloud ledger still needs an internet connection."}</p>{pwa.installed ? <StatusPill tone="green" icon={CheckCircle2}>Installed</StatusPill> : pwa.canInstall ? <Button variant="soft" icon={Download} onClick={pwa.requestInstall}>Install app</Button> : <div className="install-instructions"><strong>{pwa.ios ? "Safari" : "Browser menu"}</strong><span>{pwa.ios ? "Tap Share, then Add to Home Screen." : "Choose Install app or Add to Home Screen."}</span></div>}</div></article>
      </section>
      <section className="section-block">
        <div className="section-heading"><div><span className="eyebrow">Your data</span><h2>Download a portable copy</h2></div></div>
        <div className="download-grid">
          <button type="button" onClick={() => downloadText(data.exports.json, `fairshare-${fileSlug}.json`, "application/json")}><span className="download-icon"><FileJson size={24} /></span><div><strong>Full JSON backup</strong><small>Includes people, splits, settlements, and Trash.</small></div><Download size={19} /></button>
          <button type="button" onClick={() => downloadText(data.exports.csv, `fairshare-${fileSlug}.csv`, "text/csv")}><span className="download-icon"><ReceiptText size={24} /></span><div><strong>Activity CSV</strong><small>Open the ledger in Excel or Google Sheets.</small></div><Download size={19} /></button>
        </div>
      </section>
      <section className="about-card"><div className="brand-mark"><HandCoins size={22} /></div><div><h3>About FairShare</h3><p>An independent personal expense-sharing app. It does not connect to Splitwise and is not affiliated with Splitwise, Inc.</p></div></section>
    </>
  );
}

function ReadyApp({ data, sendAction, pwa }) {
  const [page, setPage] = useState(data.page || "overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dispatch, pending] = useAction(sendAction, page, data.render_id);

  useEffect(() => {
    if (data.page) setPage(data.page);
  }, [data.render_id]);

  const pageKey = `${data.group.id}:${data.data_revision}`;

  return (
    <div className="app-shell">
      <Sidebar data={data} page={page} setPage={setPage} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} dispatch={dispatch} />
      <div className="workspace">
        <Topbar data={data} page={page} setPage={setPage} setMobileOpen={setMobileOpen} dispatch={dispatch} pending={pending} />
        <main className="page-content">
          {page === "overview" ? <OverviewPage key={pageKey} data={data} setPage={setPage} dispatch={dispatch} pending={pending} /> : null}
          {page === "expenses" ? <ExpensesPage key={pageKey} data={data} dispatch={dispatch} pending={pending} /> : null}
          {page === "add-expense" ? <AddExpensePage key={pageKey} data={data} dispatch={dispatch} pending={pending} /> : null}
          {page === "settle" ? <SettlePage key={pageKey} data={data} dispatch={dispatch} pending={pending} /> : null}
          {page === "people" ? <PeoplePage key={pageKey} data={data} dispatch={dispatch} pending={pending} /> : null}
          {page === "settings" ? <SettingsPage key={pageKey} data={data} dispatch={dispatch} pending={pending} pwa={pwa} /> : null}
        </main>
      </div>
      <Toast flash={data.flash} />
    </div>
  );
}

export default function App({ data, sendAction }) {
  const pwa = usePwaInstall();
  if (!data || data.mode === "loading") {
    return <div className="app-loading"><span className="brand-mark"><HandCoins size={24} /></span><strong>Opening FairShare…</strong></div>;
  }
  if (data.mode === "error") return <ErrorScreen data={data} />;
  return <ReadyApp data={data} sendAction={sendAction} pwa={pwa} />;
}
