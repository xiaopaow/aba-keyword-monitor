# DeepAurum production deployment

Target:

- Host: `124.156.182.103`
- Domain: `deepaurum.com`
- App root: `/srv/deepaurum`
- MySQL: local only on `127.0.0.1:3306`

The checked-in files contain no production secrets. Runtime environment files live
under `/srv/deepaurum/config` and must remain readable only by the deployment user.

Services:

- `deepaurum-api`: NestJS on `127.0.0.1:4000`
- `deepaurum-web`: Next.js on `127.0.0.1:3000`
- `nginx`: public `80/443`
- `mysql`: local database

After DNS points to the server, issue the certificate with:

```bash
sudo certbot --nginx -d deepaurum.com -d www.deepaurum.com --redirect
```
