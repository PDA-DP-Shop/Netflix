import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeSVG } from 'qrcode.react';
import {
  ref,
  onValue,
  push,
  set,
  update,
  remove
} from 'firebase/database';
import { db } from './firebase';
import './style.css';

/* =========================================================
   ADMIN LOGIN
========================================================= */

const ADMIN_USER = 'NetflixSVR2';
const ADMIN_PASS = 'NetflixSVR2';

/* =========================================================
   FIXED NETFLIX PLAN
   DO NOT CHANGE FROM ADMIN PANEL
========================================================= */

const FIXED_PLAN = {
  id: 'premium',
  name: 'Premium',
  price: 649,
  quality: '4K + HDR',
  devices: 6,
  simultaneous: 4,
  download: 6,
  note: 'Fixed Netflix Premium monthly plan'
};

/* =========================================================
   HELPERS
========================================================= */

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
    maximumFractionDigits: 2
  })}`;

/*
  Splits ₹649 exactly between members.

  Example:
  3 members:
  ₹216.33
  ₹216.33
  ₹216.34

  Total always remains ₹649.
*/
function splitAmount(total, count, index) {
  if (!count) return 0;

  const totalPaise = Math.round(Number(total) * 100);
  const base = Math.floor(totalPaise / count);
  const remainder = totalPaise - base * count;

  return (base + (index < remainder ? 1 : 0)) / 100;
}

/* =========================================================
   APP
========================================================= */

function App() {
  const [admin, setAdmin] = useState(
    () => sessionStorage.getItem('ns_admin') === '1'
  );

  const [adminLogin, setAdminLogin] = useState(false);

  const [tab, setTab] = useState('home');

  const [friends, setFriends] = useState({});

  const [settings, setSettings] = useState({
    handlerName: 'Main Payment Handler',
    upiId: ''
  });

  const [selected, setSelected] = useState(null);

  const [notice, setNotice] = useState('');

  /* =======================================================
     FIREBASE REAL-TIME LISTENERS
  ======================================================= */

  useEffect(() => {
    const friendsListener = onValue(
      ref(db, 'friends'),
      (snapshot) => {
        setFriends(snapshot.val() || {});
      }
    );

    const settingsListener = onValue(
      ref(db, 'settings'),
      (snapshot) => {
        setSettings((current) => ({
          ...current,
          ...(snapshot.val() || {})
        }));
      }
    );

    return () => {
      friendsListener();
      settingsListener();
    };
  }, []);

  /* =======================================================
     FRIEND LIST
  ======================================================= */

  const friendList = useMemo(
    () =>
      Object.entries(friends).map(([id, value]) => ({
        id,
        ...value
      })),
    [friends]
  );

  const paid = friendList.filter(
    (friend) => friend.status === 'paid'
  ).length;

  const pending = friendList.filter(
    (friend) => friend.status !== 'paid'
  ).length;

  /* =======================================================
     ADMIN LOGIN
  ======================================================= */

  function login(event) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const username = form.get('username');
    const password = form.get('password');

    if (
      username === ADMIN_USER &&
      password === ADMIN_PASS
    ) {
      sessionStorage.setItem('ns_admin', '1');

      setAdmin(true);
      setAdminLogin(false);

      setNotice('Admin access enabled.');
    } else {
      setNotice('Invalid admin username or password.');
    }
  }

  /* =======================================================
     LOGOUT
  ======================================================= */

  function logout() {
    sessionStorage.removeItem('ns_admin');

    setAdmin(false);
    setTab('home');
    setNotice('');
  }

  /* =======================================================
     AUTOMATIC SPLIT
  ======================================================= */

  async function rebalanceMembers(memberList) {
    const count = memberList.length;

    if (!count) return;

    const changes = {};

    memberList.forEach((member, index) => {
      changes[`friends/${member.id}/planId`] =
        FIXED_PLAN.id;

      changes[`friends/${member.id}/planName`] =
        FIXED_PLAN.name;

      changes[`friends/${member.id}/amount`] =
        splitAmount(
          FIXED_PLAN.price,
          count,
          index
        );

      changes[`friends/${member.id}/updatedAt`] =
        Date.now();
    });

    await update(ref(db), changes);
  }

  /* =======================================================
     ADD MEMBER
  ======================================================= */

  async function addFriend(event) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const name = String(form.get('name')).trim();
    const phone = String(form.get('phone')).trim();

    if (!name || !phone) {
      setNotice('Please enter member name and mobile number.');
      return;
    }

    const id = push(ref(db, 'friends')).key;

    const currentMembers = friendList;

    const newCount = currentMembers.length + 1;

    const newMember = {
      id,
      name,
      phone
    };

    await set(
      ref(db, `friends/${id}`),
      {
        name,
        phone,

        planId: FIXED_PLAN.id,

        planName: FIXED_PLAN.name,

        amount: splitAmount(
          FIXED_PLAN.price,
          newCount,
          newCount - 1
        ),

        status: 'unpaid',

        utr: '',

        createdAt: Date.now()
      }
    );

    /*
      Recalculate EVERY member.

      This means existing members also receive
      the new correct share.
    */
    await rebalanceMembers([
      ...currentMembers,
      newMember
    ]);

    event.currentTarget.reset();

    setNotice(
      `Member added. ${money(
        FIXED_PLAN.price / newCount
      )} per member.`
    );
  }

  /* =======================================================
     DELETE MEMBER
  ======================================================= */

  async function deleteFriend(id) {
    await remove(
      ref(db, `friends/${id}`)
    );

    const remainingMembers =
      friendList.filter(
        (friend) => friend.id !== id
      );

    if (remainingMembers.length) {
      await rebalanceMembers(
        remainingMembers
      );
    }

    if (remainingMembers.length) {
      setNotice(
        `Member removed. Split recalculated to ${money(
          FIXED_PLAN.price /
            remainingMembers.length
        )} per member.`
      );
    } else {
      setNotice('Member removed.');
    }
  }

  /* =======================================================
     MEMBER SUBMITS PAYMENT
  ======================================================= */

  function markSubmitted(id) {
    update(
      ref(db, `friends/${id}`),
      {
        status: 'submitted',
        submittedAt: Date.now()
      }
    );

    setNotice(
      'Payment submitted for admin verification.'
    );
  }

  /* =======================================================
     ADMIN MARKS PAYMENT PAID
  ======================================================= */

  function markPaid(id) {
    update(
      ref(db, `friends/${id}`),
      {
        status: 'paid',
        paidAt: Date.now()
      }
    );

    setNotice('Payment marked as paid.');
  }

  /* =======================================================
     SAVE PAYMENT HANDLER
  ======================================================= */

  function saveSettings(event) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const handlerName =
      String(form.get('handler')).trim();

    const upiId =
      String(form.get('upi')).trim();

    set(
      ref(db, 'settings'),
      {
        handlerName,
        upiId
      }
    );

    setNotice(
      'Payment settings saved.'
    );
  }

  /* =======================================================
     PUBLIC MEMBER PAGE
  ======================================================= */

  if (!admin) {
    if (adminLogin) {
      return (
        <Login
          notice={notice}
          onLogin={login}
          onBack={() => {
            setAdminLogin(false);
            setNotice('');
          }}
        />
      );
    }

    return (
      <MemberHome
        friends={friendList}
        onSelect={setSelected}
        onAdmin={() => {
          setAdminLogin(true);
          setNotice('');
        }}
      />
    );
  }

  /* =======================================================
     ADMIN PANEL
  ======================================================= */

  return (
    <div className="app">

      <header className="adminHeader">

        <div>
          <span className="eyebrow">
            SVR-2 • PRIVATE GROUP
          </span>

          <h1>
            Netflix Splitter
          </h1>
        </div>

        <button
          className="ghost"
          onClick={logout}
        >
          Member View
        </button>

      </header>

      <nav className="adminNav">

        <button
          className={
            tab === 'home'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('home')
          }
        >
          Dashboard
        </button>

        <button
          className={
            tab === 'friends'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('friends')
          }
        >
          Members
        </button>

        <button
          className={
            tab === 'plans'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('plans')
          }
        >
          Plan
        </button>

        <button
          className={
            tab === 'settings'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTab('settings')
          }
        >
          Payment
        </button>

      </nav>

      {notice && (
        <div className="notice">
          <span>
            {notice}
          </span>

          <button
            onClick={() =>
              setNotice('')
            }
          >
            ×
          </button>
        </div>
      )}

      {tab === 'home' && (
        <Dashboard
          friends={friendList}
          paid={paid}
          pending={pending}
          onSelect={setSelected}
          onMarkPaid={markPaid}
        />
      )}

      {tab === 'friends' && (
        <Friends
          friends={friendList}
          onAdd={addFriend}
          onSelect={setSelected}
          onDelete={deleteFriend}
          onMarkPaid={markPaid}
        />
      )}

      {tab === 'plans' && (
        <Plans
          friends={friendList}
        />
      )}

      {tab === 'settings' && (
        <Settings
          settings={settings}
          onSave={saveSettings}
        />
      )}

      {selected && (
        <PaymentModal
          friend={selected}
          settings={settings}
          admin={admin}
          onClose={() =>
            setSelected(null)
          }
          onSubmit={markSubmitted}
          onMarkPaid={markPaid}
        />
      )}

    </div>
  );
}

/* =========================================================
   ADMIN LOGIN
========================================================= */

function Login({
  onLogin,
  notice,
  onBack
}) {
  return (
    <main className="login">

      <div className="loginbox">

        <button
          className="backlink"
          onClick={onBack}
        >
          ← Member Page
        </button>

        <div className="brand">
          N
        </div>

        <span className="eyebrow">
          ADMIN ACCESS
        </span>

        <h1>
          Netflix Splitter
        </h1>

        <p>
          Enter admin credentials to open
          the control panel.
        </p>

        <form
          onSubmit={onLogin}
        >

          <input
            name="username"
            required
            placeholder="Username"
            autoComplete="username"
          />

          <input
            name="password"
            required
            type="password"
            placeholder="Password"
            autoComplete="current-password"
          />

          <button>
            Open Admin Panel
          </button>

        </form>

        {notice && (
          <div className="error">
            {notice}
          </div>
        )}

      </div>

    </main>
  );
}

/* =========================================================
   PUBLIC MEMBER PAGE
========================================================= */

function MemberHome({
  friends,
  onSelect,
  onAdmin
}) {
  const share =
    friends.length
      ? FIXED_PLAN.price /
        friends.length
      : 0;

  const paid =
    friends.filter(
      (friend) =>
        friend.status === 'paid'
    ).length;

  return (
    <main className="memberhome">

      <header className="publicHeader">

        <div>
          <span className="eyebrow">
            PRIVATE GROUP
          </span>

          <h1>
            Netflix Splitter
          </h1>
        </div>

        <button
          className="ghost"
          onClick={onAdmin}
        >
          Admin Login
        </button>

      </header>

      <section className="memberHero">

        <span className="eyebrow">
          SHARED SUBSCRIPTION
        </span>

        <h2>
          One plan.
          <br />
          One simple split.
        </h2>

        <p>
          The Netflix Premium bill is
          fixed at {money(FIXED_PLAN.price)}
          per month. The member share
          automatically changes when the
          group size changes.
        </p>

        <div className="shareBox">

          <div>
            <span>
              PREMIUM PLAN
            </span>

            <strong>
              {money(FIXED_PLAN.price)}
              <small>
                /month
              </small>
            </strong>
          </div>

          <div className="divide">
            ÷
          </div>

          <div>
            <span>
              {friends.length}
              {' '}
              MEMBER
              {friends.length === 1
                ? ''
                : 'S'}
            </span>

            <strong>
              {money(share)}
              <small>
                /person
              </small>
            </strong>
          </div>

        </div>

      </section>

      <section className="memberSection">

        <div className="sectionhead">

          <div>
            <span className="eyebrow">
              GROUP MEMBERS
            </span>

            <h3>
              Payment Status
            </h3>
          </div>

          <span>
            {paid}/{friends.length}
            {' '}
            paid
          </span>

        </div>

        <div className="memberGrid">

          {friends.map(
            (friend) => (
              <FriendCard
                key={friend.id}
                friend={friend}
                onClick={() =>
                  onSelect(friend)
                }
              />
            )
          )}

        </div>

        {!friends.length && (
          <Empty
            text="Your admin has not added any members yet."
          />
        )}

      </section>

      <section className="fixedPlan">

        <div>

          <span className="eyebrow">
            FIXED MONTHLY PLAN
          </span>

          <h3>
            Netflix Premium
          </h3>

          <p>
            4K + HDR · up to 6 devices ·
            4 simultaneous streams ·
            6 downloads
          </p>

        </div>

        <strong>
          {money(FIXED_PLAN.price)}

          <small>
            /month
          </small>
        </strong>

      </section>

      <footer>
        Private group subscription manager
      </footer>

    </main>
  );
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function Dashboard({
  friends,
  paid,
  pending,
  onSelect,
  onMarkPaid
}) {
  const share =
    friends.length
      ? FIXED_PLAN.price /
        friends.length
      : 0;

  return (
    <section>

      <div className="hero">

        <div>

          <span className="eyebrow">
            LIVE GROUP STATUS
          </span>

          <h2>
            Everyone,
            <br />
            one place.
          </h2>

          <p>
            Fixed Premium plan ·
            {' '}
            {money(FIXED_PLAN.price)}
            /month ·
            {' '}
            {money(share)}
            {' '}
            per member.
          </p>

        </div>

        <div className="live">
          <i />
          LIVE
        </div>

      </div>

      <div className="stats">

        <Stat
          n={friends.length}
          l="Members"
        />

        <Stat
          n={paid}
          l="Paid"
        />

        <Stat
          n={pending}
          l="Pending"
        />

        <Stat
          n={money(share)}
          l="Each Member"
        />

      </div>

      <div className="sectionhead">

        <h3>
          Payment Board
        </h3>

        <span>
          {paid}/{friends.length}
          {' '}
          confirmed
        </span>

      </div>

      <div className="grid">

        {friends.map(
          (friend) => (
            <AdminFriendCard
              key={friend.id}
              friend={friend}
              onClick={() =>
                onSelect(friend)
              }
              onMarkPaid={onMarkPaid}
            />
          )
        )}

      </div>

      {!friends.length && (
        <Empty
          text="No members added yet. Add members from Members."
        />
      )}

    </section>
  );
}

function Stat({ n, l }) {
  return (
    <div className="stat">
      <strong>
        {n}
      </strong>

      <span>
        {l}
      </span>
    </div>
  );
}

/* =========================================================
   MEMBER CARD
========================================================= */

function FriendCard({
  friend,
  onClick
}) {
  return (
    <button
      className="card friend"
      onClick={onClick}
    >

      <div className="avatar">
        {friend.name
          ?.slice(0, 1)
          .toUpperCase()}
      </div>

      <div className="friendinfo">

        <strong>
          {friend.name}
        </strong>

        <span>
          Premium ·
          {' '}
          {money(friend.amount)}
          /month
        </span>

      </div>

      <div
        className={
          'status ' +
          friend.status
        }
      >
        {friend.status === 'paid'
          ? 'PAID'
          : friend.status ===
            'submitted'
          ? 'VERIFY'
          : 'UNPAID'}
      </div>

      <b>
        Pay
      </b>

    </button>
  );
}

/* =========================================================
   ADMIN FRIEND CARD
========================================================= */

function AdminFriendCard({
  friend,
  onClick,
  onMarkPaid
}) {
  return (
    <div className="adminFriendCard">

      <button
        className="adminFriendMain"
        onClick={onClick}
      >

        <div className="avatar">
          {friend.name
            ?.slice(0, 1)
            .toUpperCase()}
        </div>

        <div className="friendinfo">

          <strong>
            {friend.name}
          </strong>

          <span>
            {friend.phone}
          </span>

          <span>
            Premium ·
            {' '}
            {money(friend.amount)}
          </span>

        </div>

        <div
          className={
            'status ' +
            friend.status
          }
        >
          {friend.status === 'paid'
            ? 'PAID'
            : friend.status ===
              'submitted'
            ? 'VERIFY'
            : 'UNPAID'}
        </div>

      </button>

      {friend.status ===
        'submitted' && (
        <button
          className="verifyButton"
          onClick={() =>
            onMarkPaid(friend.id)
          }
        >
          Mark Paid
        </button>
      )}

    </div>
  );
}

/* =========================================================
   MEMBERS PAGE
========================================================= */

function Friends({
  friends,
  onAdd,
  onSelect,
  onDelete,
  onMarkPaid
}) {
  return (
    <section>

      <div className="sectionhead">

        <div>

          <span className="eyebrow">
            GROUP MEMBERS
          </span>

          <h2>
            Members
          </h2>

        </div>

      </div>

      <div className="twocol">

        <form
          className="panel"
          onSubmit={onAdd}
        >

          <h3>
            Add Member
          </h3>

          <p>
            Every new member is
            automatically included in
            the fixed Premium split.
          </p>

          <input
            name="name"
            required
            placeholder="Member name"
          />

          <input
            name="phone"
            required
            inputMode="numeric"
            placeholder="Mobile number"
          />

          <button>
            Add Member
          </button>

        </form>

        <div className="panel">

          <div className="paneltop">

            <div>

              <h3>
                Current Members
              </h3>

              <p>
                Automatic monthly split.
              </p>

            </div>

            <strong className="splitTotal">
              {money(FIXED_PLAN.price)}
              {' '}
              total
            </strong>

          </div>

          {friends.map(
            (friend) => (
              <div
                className="row"
                key={friend.id}
              >

                <div>
                  <b>
                    {friend.name}
                  </b>

                  <small>
                    {friend.phone}
                  </small>
                </div>

                <div className="share">

                  <b>
                    {money(friend.amount)}
                  </b>

                  <small>
                    / month
                  </small>

                </div>

                <button
                  type="button"
                  className="mini"
                  onClick={() =>
                    onSelect(friend)
                  }
                >
                  Pay
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    onDelete(friend.id)
                  }
                >
                  ×
                </button>

              </div>
            )
          )}

          {!friends.length && (
            <Empty
              text="No members yet."
            />
          )}

        </div>

      </div>

    </section>
  );
}

/* =========================================================
   FIXED PLAN PAGE
========================================================= */

function Plans({
  friends
}) {
  const share =
    friends.length
      ? FIXED_PLAN.price /
        friends.length
      : 0;

  return (
    <section>

      <div className="sectionhead">

        <div>

          <span className="eyebrow">
            LOCKED PLAN
          </span>

          <h2>
            Netflix Premium
          </h2>

        </div>

        <span>
          Fixed Monthly
        </span>

      </div>

      <div className="singlePlan">

        <span className="eyebrow">
          {FIXED_PLAN.quality}
        </span>

        <h3>
          {FIXED_PLAN.name}
        </h3>

        <strong>
          {money(FIXED_PLAN.price)}
          <small>
            /month
          </small>
        </strong>

        <div className="facts">

          <span>
            {FIXED_PLAN.devices}
            {' '}
            devices
          </span>

          <span>
            {FIXED_PLAN.simultaneous}
            {' '}
            simultaneous streams
          </span>

          <span>
            {FIXED_PLAN.download}
            {' '}
            downloads
          </span>

        </div>

        <p>
          {FIXED_PLAN.note}
        </p>

        <div className="autoSplit">

          <span>
            Automatic group split
          </span>

          <b>
            {friends.length
              ? money(share)
              : '—'}
            {' '}
            / member
          </b>

        </div>

      </div>

      <div className="lockedNote">

        <strong>
          Plan locked
        </strong>

        <br />

        The Premium price and monthly
        billing amount cannot be changed
        from this application.

        Adding or removing members only
        recalculates the individual share.

      </div>

    </section>
  );
}

/* =========================================================
   PAYMENT SETTINGS
========================================================= */

function Settings({
  settings,
  onSave
}) {
  return (
    <section>

      <div className="sectionhead">

        <div>

          <span className="eyebrow">
            UPI COLLECTION
          </span>

          <h2>
            Payment Handler
          </h2>

        </div>

      </div>

      <form
        className="panel settings"
        onSubmit={onSave}
      >

        <h3>
          Where everyone pays
        </h3>

        <p>
          This UPI ID is encoded into
          every member payment QR.
        </p>

        <label>
          Handler Name

          <input
            name="handler"
            defaultValue={
              settings.handlerName
            }
            required
          />

        </label>

        <label>
          UPI ID

          <input
            name="upi"
            required
            defaultValue={
              settings.upiId
            }
            placeholder="example@upi"
          />

        </label>

        <button>
          Save Payment Settings
        </button>

        <div className="warning">

          Premium is permanently fixed
          at {money(FIXED_PLAN.price)}
          /month.

          <br />
          <br />

          Direct UPI QR payments cannot
          independently confirm payment.
          Members submit payment and the
          admin verifies it.

        </div>

      </form>

    </section>
  );
}

/* =========================================================
   PAYMENT MODAL
========================================================= */

function PaymentModal({
  friend,
  settings,
  admin,
  onClose,
  onSubmit,
  onMarkPaid
}) {
  const upi = settings.upiId;

  const amount =
    Number(friend.amount || 0);

  const payload = upi
    ? `upi://pay?pa=${encodeURIComponent(
        upi
      )}&pn=${encodeURIComponent(
        settings.handlerName ||
          'Netflix Splitter'
      )}&am=${amount}&cu=INR&tn=${encodeURIComponent(
        `Netflix Premium - ${friend.name}`
      )}`
    : '';

  return (
    <div className="modal">

      <div className="modalbox">

        <button
          className="close"
          onClick={onClose}
        >
          ×
        </button>

        <span className="eyebrow">
          MONTHLY PAYMENT
        </span>

        <h2>
          {friend.name}
        </h2>

        <p>
          Netflix Premium
          {' · '}
          {money(amount)}
        </p>

        {payload ? (
          <QRCodeSVG
            value={payload}
            size={230}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
        ) : (
          <div className="qrplaceholder">
            Admin must set a UPI ID.
          </div>
        )}

        <div className="payactions">

          {payload && (
            <a href={payload}>
              Open UPI App
            </a>
          )}

          {!admin && (
            <button
              onClick={() => {
                onSubmit(friend.id);
                onClose();
              }}
            >
              I Have Paid
            </button>
          )}

          {admin &&
            friend.status ===
              'submitted' && (
              <button
                className="confirmButton"
                onClick={() => {
                  onMarkPaid(
                    friend.id
                  );
                  onClose();
                }}
              >
                Mark Paid
              </button>
            )}

        </div>

        <small>
          Pay to
          {' '}
          <b>
            {settings.handlerName ||
              'Main Payment Handler'}
          </b>

          <br />

          {upi ||
            'UPI ID not configured'}
        </small>

      </div>

    </div>
  );
}

/* =========================================================
   EMPTY STATE
========================================================= */

function Empty({
  text
}) {
  return (
    <div className="empty">
      {text}
    </div>
  );
}

/* =========================================================
   START APP
========================================================= */

createRoot(
  document.getElementById('root')
).render(
  <App />
);
