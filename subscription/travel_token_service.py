import requests
import json
from django.conf import settings
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)

class TravelTokenService:
    """
    Service class for Access.com Travel Token API integration
    """
    
    def __init__(self):
        self.api_url = "https://auth.adcrws.com/api/v1/tokens"
        self.api_key = "12968385107f16fa2bc5bb748684ef7ddb989304b9d958bc4de6acf48693a3fe"
        
    def create_session_token(self, member_key, email=None, first_name=None, last_name=None, scope="travel"):
        """
        Create a session token from Access Authentication Provider
        
        Args:
            member_key (str): Unique identifier for the user
            email (str, optional): User's email address
            first_name (str, optional): User's first name
            last_name (str, optional): User's last name
            scope (str): Required scope for the token (default: 'travel')
            
        Returns:
            dict: Response containing session_token or error
        """
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}'
        }
        
        payload = {
            "member_key": member_key,
            "scope": scope
        }
        
        # Add optional fields if provided
        if email:
            payload["email"] = email
        if first_name:
            payload["first_name"] = first_name
        if last_name:
            payload["last_name"] = last_name
            
        try:
            logger.info(f"Creating travel token for member_key: {member_key}")
            logger.info(f"Request URL: {self.api_url}")
            logger.info(f"Request Headers: {headers}")
            logger.info(f"Request Payload: {payload}")
            
            response = requests.post(
                self.api_url,
                headers=headers,
                data=json.dumps(payload),
                timeout=30
            )
            
            logger.info(f"Response Status Code: {response.status_code}")
            logger.info(f"Response Text: {response.text}")
            
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                response_data = {"message": response.text}
            
            if response.status_code == 200:
                logger.info(f"Travel token created successfully for member_key: {member_key}")
                return {
                    "success": True,
                    "session_token": response_data.get("session_token"),
                    "member_key": member_key,
                    "scope": scope
                }
            else:
                logger.error(f"Failed to create travel token: {response.status_code} - {response_data}")
                return {
                    "success": False,
                    "error": response_data.get("message", f"API returned {response.status_code}: {response.text}"),
                    "status_code": response.status_code,
                    "response_data": response_data
                }
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request exception while creating travel token: {str(e)}")
            return {
                "success": False,
                "error": f"Network error: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Unexpected error while creating travel token: {str(e)}")
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}"
            }
    
    def verify_token_status(self, session_token):
        """
        Verify if a session token is still valid (placeholder method)
        You may need to implement this based on Access.com API documentation
        """
        # This would depend on Access.com providing a verification endpoint
        return {"status": "active", "token": session_token}
