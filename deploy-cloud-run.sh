#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-jgames}"
PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
IMAGE="${IMAGE:-gcr.io/${PROJECT_ID}/${SERVICE_NAME}}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required."
  echo "Example: PROJECT_ID=my-gcp-project REGION=us-central1 ./deploy-cloud-run.sh"
  exit 1
fi

if [[ -z "${MONGODB_URI:-}" || -z "${JWT_SECRET:-}" ]]; then
  echo "MONGODB_URI and JWT_SECRET are required environment variables."
  exit 1
fi

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"

if [[ -z "${PUBLIC_BASE_URL}" ]]; then
  PUBLIC_BASE_URL="https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app"
fi

echo "Setting project to ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "Building and pushing image ${IMAGE}"
gcloud builds submit --tag "${IMAGE}" .

echo "Deploying ${SERVICE_NAME} to Cloud Run (${REGION})"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --min-instances 0 \
  --cpu-throttling \
  --set-env-vars "MONGODB_URI=${MONGODB_URI},JWT_SECRET=${JWT_SECRET},PUBLIC_BASE_URL=${PUBLIC_BASE_URL}"

echo "Deployment complete."