# Nightly encrypted, off-site backups with restic: database dump, uploaded media, private files
# (résumés) and the rendered Caddy configuration. Release folders can be rebuilt from their snapshots
# in the database, so they are not copied.
FROM postgres:17-alpine
RUN apk add --no-cache restic tzdata
ENV TZ=Asia/Kolkata
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
CMD ["/usr/local/bin/backup.sh", "--loop"]
