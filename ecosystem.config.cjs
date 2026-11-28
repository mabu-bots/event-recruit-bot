// ==========================================
// 🔄 pm2 常駐設定（event-recruit-bot）
// ==========================================
// 起動: pm2 start ecosystem.config.cjs
// 再起動後も自動で立ち上げるには pm2 startup（表示されるコマンドを
// 実行）と pm2 save を行う。
//
// .env は Node の --env-file で読み込む（npm start と同じ方式）。
// トークン等の秘密は .env（git 管理外）にだけ置き、ここには書かない。
// READY ウォッチドッグ（src/watchdog.ts）が停滞を検知してプロセスを
// 終了させた場合も、pm2 の autorestart で再起動する前提の構成とする。

module.exports = {
  apps: [
    {
      name: "event-recruit-bot",
      script: "dist/src/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      kill_timeout: 5000,
      node_args: "--env-file=.env",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
