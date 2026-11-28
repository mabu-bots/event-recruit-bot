@echo off
rem event-recruit-bot の一括ビルドスクリプト (Windows 用)。
rem 依存パッケージの取得から、型チェック込みのビルド、テスト実行までを
rem 1コマンドで行う。途中で失敗したら、その時点で終了する。
setlocal
cd /d %~dp0

echo ==^> 依存パッケージを取得します
call npm install
if errorlevel 1 exit /b %errorlevel%

echo ==^> ビルドとテストを実行します
call npm test
if errorlevel 1 exit /b %errorlevel%

echo 完了しました。起動するには .env を用意して npm start を実行してください
endlocal
