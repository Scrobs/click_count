#!/bin/bash
# generate-cert.sh

# Generate root CA
openssl req -x509 -nodes -new -sha256 -days 1024 -newkey rsa:2048 -keyout RootCA.key -out RootCA.pem -subj "/C=US/CN=Local-Root-CA"
openssl x509 -outform pem -in RootCA.pem -out RootCA.crt

# Generate local certificate
openssl req -new -nodes -newkey rsa:2048 -keyout localhost.key -out localhost.csr -subj "/C=US/ST=State/L=City/O=Company/CN=localhost"
openssl x509 -req -sha256 -days 1024 -in localhost.csr -CA RootCA.pem -CAkey RootCA.key -CAcreateserial -extfile domains.ext -out localhost.crt

# Move certificates to certs directory
mkdir -p certs
mv localhost.key certs/
mv localhost.crt certs/