terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  required_services = toset([
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ])

  direct_domain_mapping_regions = toset([
    "asia-east1",
    "asia-northeast1",
    "asia-southeast1",
    "europe-north1",
    "europe-west1",
    "europe-west4",
    "us-central1",
    "us-east1",
    "us-east4",
    "us-west1",
  ])

  secret_ids = {
    DATABASE_URL          = "devobs-database-url"
    STRIPE_SECRET_KEY     = "devobs-stripe-secret-key"
    STRIPE_WEBHOOK_SECRET = "devobs-stripe-webhook-secret"
    RESEND_API_KEY        = "devobs-resend-api-key"
  }

  deployer_roles = toset([
    "roles/run.admin",
    "roles/serviceusage.serviceUsageConsumer",
  ])
}

resource "google_project_service" "required" {
  for_each           = local.required_services
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repository
  description   = "Container images for the Devobs SaaS application."
  format        = "DOCKER"
  depends_on    = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "devobs-saas-runtime"
  display_name = "Devobs SaaS Cloud Run runtime"
  description  = "Identity used by the Devobs SaaS Cloud Run service and migration job."
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "devobs-saas-deployer"
  display_name = "Devobs SaaS GitHub Actions deployer"
  description  = "Federated GitHub Actions identity for production deployment."
}

resource "google_project_iam_member" "deployer" {
  for_each = local.deployer_roles
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "runtime_cloud_sql" {
  count   = var.enable_cloud_sql ? 1 : 0
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_can_act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-devobs-saas"
  display_name              = "GitHub Actions for Devobs SaaS"
  description               = "Federation limited to the main branch of the Devobs SaaS repository."
  depends_on                = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions OIDC"
  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }
  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '${var.github_repository_owner_id}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

resource "google_secret_manager_secret" "app" {
  for_each  = local.secret_ids
  project   = var.project_id
  secret_id = each.value
  labels = {
    application = "devobs-saas"
    environment = "production"
  }
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each  = google_secret_manager_secret.app
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_domain_mapping" "app" {
  count    = var.domain_name == "" ? 0 : 1
  project  = var.project_id
  location = var.region
  name     = var.domain_name

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = var.service_name
  }

  lifecycle {
    precondition {
      condition     = contains(local.direct_domain_mapping_regions, var.region)
      error_message = "Cloud Run direct domain mappings are supported only in asia-east1, asia-northeast1, asia-southeast1, europe-north1, europe-west1, europe-west4, us-central1, us-east1, us-east4, and us-west1."
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_monitoring_notification_channel" "email" {
  count        = var.notification_email == "" ? 0 : 1
  project      = var.project_id
  display_name = "Devobs SaaS uptime alerts"
  type         = "email"
  labels = {
    email_address = var.notification_email
  }
  depends_on = [google_project_service.required]
}

resource "google_monitoring_uptime_check_config" "app" {
  count        = var.domain_name == "" ? 0 : 1
  project      = var.project_id
  display_name = "Devobs SaaS HTTPS health check"
  period       = "60s"
  timeout      = "10s"
  selected_regions = [
    "USA",
    "EUROPE",
    "ASIA_PACIFIC",
  ]

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = var.domain_name
      project_id = var.project_id
    }
  }

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  depends_on = [google_cloud_run_domain_mapping.app]
}

resource "google_monitoring_alert_policy" "uptime" {
  count        = var.domain_name == "" ? 0 : 1
  project      = var.project_id
  display_name = "Devobs SaaS is unavailable"
  combiner     = "OR"
  conditions {
    display_name = "HTTPS health check is failing"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND resource.label.host=\"${var.domain_name}\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.app[0].uptime_check_id}\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      trigger {
        count = 1
      }
      aggregations {
        alignment_period   = "120s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }
    }
  }
  notification_channels = var.notification_email == "" ? [] : [google_monitoring_notification_channel.email[0].name]
  alert_strategy {
    auto_close = "604800s"
  }
  depends_on = [google_monitoring_uptime_check_config.app]
}
