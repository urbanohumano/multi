"""Render tests for humhub/install_humhub.sh (DRY_RUN=1 changes nothing on the machine)."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "humhub" / "install_humhub.sh"


def render(**env) -> tuple[Path, str]:
    out = Path(tempfile.mkdtemp())
    full_env = {**os.environ, "DRY_RUN": "1", "RENDER_DIR": str(out), "PHPV": "8.3", **env}
    result = subprocess.run(["bash", str(SCRIPT)], env=full_env, capture_output=True, text=True, check=True)
    return out, result.stdout + result.stderr


class HumHubRender(unittest.TestCase):
    def test_defaults_target_the_community_subdomain(self):
        out, log = render()
        self.assertIn("host=community.360democracy.com", log)
        vhost = (out / "nginx-humhub.conf").read_text()
        self.assertIn("server_name community.360democracy.com;", vhost)
        self.assertIn("root /var/www/humhub;", vhost)
        self.assertIn("fastcgi_pass unix:/run/php/php8.3-fpm.sock;", vhost)
        self.assertIn("try_files $uri $uri/ /index.php$is_args$args;", vhost)

    def test_sensitive_paths_are_denied(self):
        vhost = (render()[0] / "nginx-humhub.conf").read_text()
        self.assertIn(r"location ~ ^/(protected|framework|themes/\w+/views|\.|uploads/file) {", vhost)
        self.assertIn(r"location ~ ^/assets/.*\.php$ {", vhost)

    def test_apache_variant_uses_php_fpm(self):
        apache = (render()[0] / "apache-humhub.conf").read_text()
        self.assertIn("ServerName community.360democracy.com", apache)
        self.assertIn('SetHandler "proxy:unix:/run/php/php8.3-fpm.sock|fcgi://localhost"', apache)
        self.assertIn("AllowOverride All", apache)

    def test_runtime_files(self):
        out, _ = render(HUMHUB_DIR="/srv/community")
        self.assertIn("HUMHUB_DEBUG=false", (out / "env").read_text())
        cron = (out / "cron-humhub").read_text()
        self.assertIn("www-data /usr/bin/php /srv/community/protected/yii queue/run", cron)
        self.assertIn("www-data /usr/bin/php /srv/community/protected/yii cron/run", cron)
        self.assertIn("upload_max_filesize = 32M", (out / "90-humhub.ini").read_text())
        self.assertIn("humhub\\modules\\installer\\commands\\InstallController::class", (out / "console.php").read_text())

    def test_custom_hostname_and_invalid_hostname(self):
        out, _ = render(HUMHUB_HOSTNAME="test.example.org")
        self.assertIn("server_name test.example.org;", (out / "nginx-humhub.conf").read_text())
        with self.assertRaises(subprocess.CalledProcessError):
            render(HUMHUB_HOSTNAME="Not A Host")

    @unittest.skipUnless(shutil.which("php"), "php not installed")
    def test_console_config_is_valid_php(self):
        out, _ = render()
        result = subprocess.run(["php", "-l", str(out / "console.php")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
