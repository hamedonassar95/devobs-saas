output "project_id" {
  description = "Configured Google Cloud project."
  value       = var.project_id
}

output "region" {
  description = "Configured deployment region."
  value       = var.region
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository used by GitHub Actions."
  value       = google_artifact_registry_repository.app.repository_id
}

output "runtime_service_account" {
  description = "Cloud Run runtime service account email."
  value       = google_service_account.runtime.email
}

output "deploy_service_account" {
  description = "GitHub Actions deploy service account email."
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "Workload Identity Provider resource name for GitHub Actions."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "domain_mapping_records" {
  description = "DNS records returned by Cloud Run when a custom domain is configured."
  value       = var.domain_name == "" ? [] : google_cloud_run_domain_mapping.app[0].status[0].resource_records
}
