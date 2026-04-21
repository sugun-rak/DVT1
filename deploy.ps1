$ErrorActionPreference = "Stop"
$gcloud = "C:\Users\RAKSHIT\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$project = "project-ddd9bb71-3e69-4493-b03"
$region = "us-central1"
$dbUrl = "postgresql://neondb_owner:npg_1NpKRlLnF0JT@ep-misty-shadow-aosco3ux.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

Write-Host "Deploying Voter Auth Service (Initial)..."
$authUrl = & $gcloud run deploy dvt-auth-service --source ./services/voter-auth-service --region $region --project $project --allow-unauthenticated --set-env-vars "DATABASE_URL=$dbUrl" --format="value(status.url)"
Write-Host "Auth Service URL: $authUrl"

Write-Host "Deploying Election Data Service..."
$electionUrl = & $gcloud run deploy dvt-election-service --source ./services/election-data-service --region $region --project $project --allow-unauthenticated --set-env-vars "DATABASE_URL=$dbUrl,AUTH_SERVICE_URL=$authUrl" --format="value(status.url)"
Write-Host "Election Service URL: $electionUrl"

Write-Host "Redeploying Voter Auth Service (with Election URL)..."
& $gcloud run deploy dvt-auth-service --source ./services/voter-auth-service --region $region --project $project --allow-unauthenticated --set-env-vars "DATABASE_URL=$dbUrl,ELECTION_SERVICE_URL=$electionUrl" --quiet

Write-Host "Deploying API Gateway..."
$gatewayUrl = & $gcloud run deploy dvt-api-gateway --source ./services/api-gateway --region $region --project $project --allow-unauthenticated --set-env-vars "VERIFICATION_SERVICE_URL=$authUrl,VOTING_SERVICE_URL=$electionUrl" --format="value(status.url)"
Write-Host "API Gateway URL: $gatewayUrl"

Write-Host "Updating Frontend Configuration..."
$frontendConfig = "export const API_URL = '$gatewayUrl/api';"
Set-Content -Path ".\frontend\src\config.js" -Value $frontendConfig

Write-Host "Deploying Frontend..."
$frontendUrl = & $gcloud run deploy dvt-frontend --source ./frontend --region $region --project $project --allow-unauthenticated --port 80 --format="value(status.url)"
Write-Host "Frontend URL: $frontendUrl"

Write-Host "=========================================="
Write-Host "DEPLOYMENT COMPLETE!"
Write-Host "Live App URL: $frontendUrl"
Write-Host "=========================================="
