#!/bin/sh
# 在服务器上更新程序：备份数据库和旧程序，换上 /tmp/journal.new，重启并检查。
# 用法（在本地执行）：ssh server sh -s < deploy/update.sh
set -e
SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=
NEW=/tmp/journal.new
[ -f "$NEW" ] || { echo "找不到 $NEW，请先上传新程序"; exit 1; }

B=/var/lib/journal-backup-$(date +%Y%m%d-%H%M%S)
$SUDO systemctl stop journal
$SUDO install -d -m 700 "$B"
$SUDO cp -a /var/lib/journal/. "$B/"
$SUDO cp -a /opt/journal/journal "$B/journal.old"
$SUDO install -o root -g root -m 755 "$NEW" /opt/journal/journal
rm -f "$NEW"
$SUDO systemctl start journal
sleep 2
$SUDO systemctl is-active journal
echo "备份: $B"
curl -s -o /dev/null -w "API 无口令: %{http_code}（应为 401）\n" http://127.0.0.1:8800/api/overview
