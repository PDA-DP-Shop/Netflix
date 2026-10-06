# Netflix Splitter

A private friend-group subscription splitter designed for GitHub Pages + Firebase Realtime Database.

## Features
- Fixed admin login requested by the owner
- Add/remove friends with name + mobile number
- Netflix plan catalog with price, quality, devices, simultaneous streams and downloads
- Assign plans and calculate each friend's amount
- UPI QR containing the payment handler's UPI ID
- UPI deep link for supported mobile apps
- Live Firebase status: UNPAID → VERIFY → PAID
- Admin payment handler settings
- Mobile responsive black/white UI

## Important payment limitation
A generic UPI QR/deep link does not provide a browser with a trusted payment-success callback. Therefore this app deliberately uses an admin verification step. A friend can submit “I have paid”; the admin then confirms PAID. If you need automatic verification, integrate a payment provider with server-side webhooks.

## 1. Firebase
1. Create a Firebase project.
2. Create a Web App and copy its config into `src/firebase.js`.
3. Enable **Realtime Database**.
4. For a private app, use proper authenticated Firebase security rules. The included `firebase.rules.json` is only a development starting point and is intentionally open.

## 2. Local test
```bash
npm install
npm run dev
```

## 3. GitHub Pages
Push the project to GitHub, then enable GitHub Pages using GitHub Actions or deploy the `dist` directory with your preferred Pages workflow.

Because Vite uses root-relative assets, if your repository is `username.github.io/repo-name`, set `base: '/repo-name/'` in `vite.config.js` before building.

## Admin
Username: `NetflixSVR2`
Password: `NetflixSVR2`

For production, replace this client-side login with Firebase Authentication. A client-side fixed password is not a secure access-control mechanism because frontend code can be inspected.
