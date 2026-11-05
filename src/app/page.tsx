import {
  ArrowDownRight,
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  CirclePlus,
  Clock3,
  Crown,
  Flag,
  LayoutDashboard,
  Medal,
  Plus,
  Settings2,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";

const leaderboard = [
  { rank: "01", name: "Mason Cole", initials: "MC", points: 142, wins: 5, tone: "mint" },
  { rank: "02", name: "Olivia Chen", initials: "OC", points: 126, wins: 4, tone: "rose" },
  { rank: "03", name: "You", initials: "JL", points: 98, wins: 3, tone: "gold" },
];

const events = [
  { day: "FRI", date: "24", month: "OCT", title: "Friday Night Freezeout", group: "The River Club", time: "7:30 PM", guests: "6 going", color: "green" },
  { day: "WED", date: "29", month: "OCT", title: "Autumn Championship", group: "Westside Cards", time: "6:00 PM", guests: "11 going", color: "amber" },
];

const activity = [
  { icon: Trophy, title: "Mason won Friday Night #18", detail: "The River Club · 2 days ago", points: "+18 pts", color: "green" },
  { icon: UsersRound, title: "You joined Westside Cards", detail: "Group invitation · 5 days ago", points: "Joined", color: "blue" },
  { icon: Medal, title: "You finished 2nd at Home Game #12", detail: "The River Club · Oct 10", points: "+10 pts", color: "amber" },
];

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="Felt home">
          <span className="brand-mark"><span>F</span></span>
          <span className="brand-name">felt<span className="brand-period">.</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switcher">
          <span className="workspace-avatar">J</span>
          <span className="workspace-copy"><strong>Jordan&apos;s league</strong><small>Personal space</small></span>
          <ChevronDown size={15} />
        </button>
        <nav className="primary-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#dashboard"><LayoutDashboard size={17} />Overview</a>
          <a className="nav-item" href="#groups"><UsersRound size={17} />My groups<span className="nav-count">2</span></a>
          <a className="nav-item" href="#events"><CalendarDays size={17} />Events<span className="nav-count">2</span></a>
          <a className="nav-item" href="#leaderboard"><Trophy size={17} />Leaderboards</a>
        </nav>
        <div className="sidebar-section-heading"><span>YOUR GROUPS</span><button aria-label="Create group"><Plus size={15} /></button></div>
        <a className="group-link" href="#groups"><span className="group-dot dot-green" />The River Club<span className="group-chevron">›</span></a>
        <a className="group-link" href="#groups"><span className="group-dot dot-amber" />Westside Cards<span className="group-chevron">›</span></a>
        <div className="sidebar-bottom">
          <div className="setup-note"><span className="setup-icon"><ShieldCheck size={15} /></span><div><strong>Setup required</strong><small>Connect Supabase to enable accounts and save league data.</small></div></div>
          <button className="nav-item settings-link"><Settings2 size={17} />Settings</button>
          <div className="user-row"><span className="user-avatar">JL</span><div className="user-copy"><strong>Jordan Lee</strong><small>Personal account</small></div><ChevronDown size={15} className="user-chevron" /></div>
        </div>
      </aside>

      <section className="main-column" id="dashboard">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div>
          <div className="topbar-actions"><span className="preview-pill"><span />Preview data</span><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button><span className="top-avatar">JL</span></div>
        </header>
        <div className="content-wrap">
          <div className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" />MONDAY, OCTOBER 20, 2025</div><h1>Good evening, Jordan<span className="heading-dot">.</span></h1><p className="welcome-copy">The next hand is always a fresh start. Here&apos;s your league at a glance.</p></div>
            <button className="primary-button"><CirclePlus size={16} />Create a group</button>
          </div>
          <section className="stats-grid" aria-label="Personal statistics">
            <article className="stat-panel"><div className="stat-label">TOTAL POINTS <span className="stat-symbol">↗</span></div><div className="stat-value">98<span className="stat-unit">pts</span></div><div className="stat-foot"><span className="positive"><ArrowDownRight size={13} />12</span> from last month</div><div className="sparkline"><i style={{ height: "31%" }} /><i style={{ height: "44%" }} /><i style={{ height: "36%" }} /><i style={{ height: "58%" }} /><i style={{ height: "47%" }} /><i style={{ height: "70%" }} /><i style={{ height: "62%" }} /><i style={{ height: "88%" }} /><i style={{ height: "74%" }} /><i style={{ height: "100%" }} /></div></article>
            <article className="stat-panel"><div className="stat-label">TOURNAMENTS <span className="stat-symbol"><Flag size={13} /></span></div><div className="stat-value">14</div><div className="stat-foot">Across <strong>2 groups</strong></div><div className="stat-bottom-rule"><span style={{ width: "66%" }} /></div></article>
            <article className="stat-panel"><div className="stat-label">1ST PLACE FINISHES <span className="stat-symbol"><Crown size={14} /></span></div><div className="stat-value">3</div><div className="stat-foot">Top 3 in <strong>57%</strong> of games</div><div className="stat-bottom-rule gold-rule"><span style={{ width: "57%" }} /></div></article>
            <article className="stat-panel"><div className="stat-label">CURRENT STREAK <span className="stat-symbol">✳</span></div><div className="stat-value">4<span className="stat-unit">games</span></div><div className="stat-foot">Your best is <strong>6 games</strong></div><div className="streak-dots"><i /><i /><i /><i /><i /><i className="empty" /></div></article>
          </section>
          <div className="section-grid">
            <section className="content-panel leaderboard-panel" id="leaderboard">
              <div className="panel-heading"><div><div className="panel-kicker">THE RIVER CLUB</div><h2>Leaderboard</h2></div><button className="select-button">This season <ChevronDown size={14} /></button></div>
              <div className="leaderboard-table"><div className="table-head"><span>PLAYER</span><span>POINTS</span><span>WINS</span></div>{leaderboard.map((player) => <div className={`leader-row ${player.name === "You" ? "you-row" : ""}`} key={player.rank}><span className="player-cell"><span className={`rank-number ${player.rank === "01" ? "first-rank" : ""}`}>{player.rank}</span><span className={`player-avatar ${player.tone}`}>{player.initials}</span><span className="player-name">{player.name}{player.name === "You" && <small>YOU</small>}</span></span><strong className="points-cell">{player.points}<small> pts</small></strong><span className="wins-cell">{player.wins}</span></div>)}</div>
              <a className="panel-link" href="#leaderboard">View full leaderboard <ArrowRight size={15} /></a>
            </section>
            <section className="content-panel events-panel" id="events">
              <div className="panel-heading"><div><div className="panel-kicker">ON THE CALENDAR</div><h2>Upcoming events <span className="heading-count">2</span></h2></div><button className="icon-button add-event" aria-label="Create event"><Plus size={18} /></button></div>
              <div className="event-list">{events.map((event) => <article className="event-item" key={event.title}><div className={`event-date ${event.color}`}><small>{event.day}</small><strong>{event.date}</strong><small>{event.month}</small></div><div className="event-info"><h3>{event.title}</h3><div className="event-group">{event.group}</div><div className="event-meta"><span><Clock3 size={12} />{event.time}</span><span><UsersRound size={12} />{event.guests}</span></div></div><button className="event-more" aria-label={`More options for ${event.title}`}>···</button></article>)}</div>
              <a className="panel-link" href="#events">View all events <ArrowRight size={15} /></a>
            </section>
          </div>
          <section className="content-panel activity-panel">
            <div className="panel-heading activity-heading"><div><div className="panel-kicker">ACROSS YOUR GROUPS</div><h2>Recent activity</h2></div><button className="text-button">View history <ArrowRight size={14} /></button></div>
            <div className="activity-list">{activity.map((item) => { const Icon = item.icon; return <article className="activity-item" key={item.title}><span className={`activity-icon ${item.color}`}><Icon size={16} /></span><div className="activity-copy"><strong>{item.title}</strong><small>{item.detail}</small></div><span className={`activity-tag ${item.color}`}>{item.points}</span></article>; })}</div>
          </section>
          <footer className="page-footer"><span>Made for the people around your table.</span><span>Physical games. Friendly competition. <b>♠</b></span></footer>
        </div>
      </section>
    </main>
  );
}
