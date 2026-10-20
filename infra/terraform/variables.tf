variable "project_id" {
  description = "Google Cloud project ID that owns the production resources."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "Google Cloud region for Cloud Run and Artifact Registry."
  type        = string
  default     = "us-central1"
}

variable "artifact_repository" {
  description = "Artifact Registry Docker repository ID."
  type        = string
  default     = "devobs-saas"
}

variable "service_name" {
  description = "Cloud Run service name used by the deployment workflow and domain mapping."
  type        = string
  default     = "devobs-saas"
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID allowed to deploy through Workload Identity Federation."
  type        = string
  default     = "1427013208"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "github_repository_id must contain only digits."
  }
}

variable "github_repository_owner_id" {
  description = "Immutable GitHub owner ID allowed to deploy through Workload Identity Federation."
  type        = string
  default     = "104053101"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_owner_id))
    error_message = "github_repository_owner_id must contain only digits."
  }
}

variable "domain_name" {
  description = "Production hostname to map to Cloud Run; leave empty until the service is deployed and the domain is verified."
  type        = string
  default     = ""
}

variable "notification_email" {
  description = "Email address for uptime alerts. Google may require the recipient to verify the notification channel."
  type        = string
  default     = ""
}

variable "enable_cloud_sql" {
  description = "Grant the runtime identity Cloud SQL Client when Cloud Run will attach a Cloud SQL instance."
  type        = bool
  default     = false
}
