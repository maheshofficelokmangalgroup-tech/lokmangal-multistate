//! Outgoing email over SMTP. Emails are always sent from background jobs, after the database commit,
//! so an SMTP outage never loses an enquiry (it is retried instead).

use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, header::ContentType},
    transport::smtp::authentication::Credentials,
};
use serde::{Deserialize, Serialize};

use crate::config::{Config, SmtpSecurity};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OutgoingEmail {
    pub to: Vec<String>,
    pub subject: String,
    pub text: String,
}

pub struct Mailer {
    transport: Option<AsyncSmtpTransport<Tokio1Executor>>,
    from: Mailbox,
}

impl Mailer {
    pub fn from_config(config: &Config) -> anyhow::Result<Self> {
        let from: Mailbox = config
            .mail_from
            .parse()
            .map_err(|e| anyhow::anyhow!("MAIL_FROM is not a valid address: {e}"))?;
        let transport = match &config.smtp {
            None => None,
            Some(smtp) => {
                let mut builder = match smtp.security {
                    SmtpSecurity::StartTls => {
                        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp.host)?
                    }
                    SmtpSecurity::Tls => AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp.host)?,
                    SmtpSecurity::None => {
                        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&smtp.host)
                    }
                }
                .port(smtp.port);
                if let (Some(user), Some(password)) = (&smtp.user, &smtp.password) {
                    builder = builder.credentials(Credentials::new(user.clone(), password.clone()));
                }
                Some(builder.build())
            }
        };
        Ok(Self { transport, from })
    }

    pub fn is_configured(&self) -> bool {
        self.transport.is_some()
    }

    pub async fn send(&self, email: &OutgoingEmail) -> anyhow::Result<()> {
        let Some(transport) = &self.transport else {
            tracing::warn!(subject = %email.subject, recipients = email.to.len(), "SMTP not configured; email not sent");
            anyhow::bail!("SMTP is not configured");
        };
        if email.to.is_empty() {
            anyhow::bail!("no recipients configured for this notification");
        }
        let mut builder = Message::builder()
            .from(self.from.clone())
            .subject(&email.subject)
            .header(ContentType::TEXT_PLAIN);
        for to in &email.to {
            builder = builder.to(to
                .parse()
                .map_err(|e| anyhow::anyhow!("invalid recipient: {e}"))?);
        }
        transport.send(builder.body(email.text.clone())?).await?;
        Ok(())
    }
}
