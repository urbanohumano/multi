"""Render tests for discourse/install_discourse.sh (DRY_RUN=1 changes nothing on the machine)."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "discourse" / "install_discourse.sh"


def render(mode: str, **env) -> tuple[Path, str]:
    out = Path(tempfile.mkdtemp())
    full_env = {
        **os.environ,
        "DRY_RUN": "1",
        "INSTALL_MODE": mode,
        "RENDER_DIR": str(out),
        "DISCOURSE_HOSTNAME": "community.example.org",
        "ADMIN_EMAILS": "a@example.org,b@example.org",
        **env,
    }
    result = subprocess.run(["bash", str(SCRIPT)], env=full_env, capture_output=True, text=True, check=True)
    return out, result.stdout + result.stderr


class InstallRender(unittest.TestCase):
    def test_standalone_exposes_ports_and_uses_letsencrypt(self):
        out, log = render("standalone", SMTP_HOST="smtp-relay.brevo.com", SMTP_USER="u", SMTP_PASSWORD="p")
        app = (out / "app.yml").read_text()
        self.assertIn('"80:80"', app)
        self.assertIn("web.letsencrypt.ssl.template.yml", app)
        self.assertNotIn("web.socketed.template.yml", app)
        self.assertIn("LETSENCRYPT_ACCOUNT_EMAIL", app)
        self.assertFalse((out / "nginx-discourse.conf").exists())
        self.assertIn("mode=standalone", log)

    def test_socketed_leaves_ports_to_the_host_web_server(self):
        out, _ = render("socketed", SMTP_HOST="smtp-relay.brevo.com", SMTP_USER="u", SMTP_PASSWORD="p")
        app = (out / "app.yml").read_text()
        self.assertIn("web.socketed.template.yml", app)
        self.assertNotIn("expose:", app)
        self.assertNotIn("letsencrypt", app)
        self.assertIn("UNICORN_WORKERS: 2", app)
        vhost = (out / "nginx-discourse.conf").read_text()
        self.assertIn("server_name community.example.org;", vhost)
        self.assertIn("proxy_pass http://unix:/var/discourse/shared/standalone/nginx.http.sock:;", vhost)
        self.assertIn("proxy_set_header X-Forwarded-Proto $scheme;", vhost)
        apache = (out / "apache-discourse.conf").read_text()
        self.assertIn('ProxyPass / "unix:/var/discourse/shared/standalone/nginx.http.sock|http://127.0.0.1/"', apache)

    def test_special_characters_in_password_are_quoted(self):
        out, _ = render("standalone", SMTP_HOST="h", SMTP_USER="u", SMTP_PASSWORD='p#a"s\\s')
        self.assertIn('DISCOURSE_SMTP_PASSWORD: "p#a\\"s\\\\s"', (out / "app.yml").read_text())

    def test_port_465_switches_to_implicit_tls(self):
        out, _ = render("standalone", SMTP_HOST="smtp.tem.scaleway.com", SMTP_PORT="465", SMTP_USER="u", SMTP_PASSWORD="p")
        app = (out / "app.yml").read_text()
        self.assertIn("DISCOURSE_SMTP_FORCE_TLS: true", app)
        self.assertIn("DISCOURSE_SMTP_ENABLE_START_TLS: false", app)

    def test_missing_smtp_uses_placeholder(self):
        out, log = render("socketed")
        self.assertIn("smtp.example.invalid", (out / "app.yml").read_text())
        self.assertIn("SMTP_HOST not set", log)

    def test_invalid_hostname_is_rejected(self):
        with self.assertRaises(subprocess.CalledProcessError):
            render("standalone", DISCOURSE_HOSTNAME="Not A Host")


if __name__ == "__main__":
    unittest.main()
