import scrapy
import re
from external_config import load_ifttt_credentials


class ifttt_userJWT_spider(scrapy.Spider):
    name = "ifttt.com"
    start_urls = ["https://ifttt.com/login"]
    module_name_path = "./data/module_name.json"

    def __init__(self, *args, **kwargs):
        super(ifttt_userJWT_spider, self).__init__(*args, **kwargs)

        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"

        keys = load_ifttt_credentials(require_authorization=False)
        self.username = keys["username"]
        self.email = keys["email"]
        self.password = keys["password"]

    def parse(self, response):
        # get authenticity token
        # self.logger.info(response.text)

        # authenticity_token = response.css(
        #     "input[type=hidden]:nth-child(2)::attr(value)"
        # ).get()

        yield scrapy.FormRequest.from_response(
            response,
            formdata={
                "utf8": "✓",
                #"authenticity_token": authenticity_token,
                "return_to": None,
                "psu_": None,
                "user[username]": self.email,
                "user[password]": self.password,
                "commit": "Log+in",
            },
            headers={"User-Agent": self.user_agent},
            callback=self.login_check,
        )

    def login_check(self, response):
        # check if successfully logged in
        if b"The email and password don&#39;t match." in response.body:
            self.logger.error("Login failed: Wrong username or password.")
            return

        self.logger.info("Successfully login.")

        headers = {
            "Content-Type": "text/html; charset=utf-8",
        }

        yield scrapy.Request(
            "https://ifttt.com/create",
            method="GET",
            headers=headers,
            callback=self.get_JWTtoken,
        )

    def get_JWTtoken(self, response):
        # self.logger.info(response.text)

        pattern_JWT = r'userJWT:\s*\'(.*?)\''
        pattern_authenticityToken = r'authenticityToken:\s*\'(.*?)\''

        match_JWT = re.search(pattern_JWT, response.text)
        if match_JWT:
            self.logger.warning(
                "A user token was detected but was not persisted; supply credentials through the environment."
            )

        match_authenticityToken = re.search(pattern_authenticityToken,response.text)
        if match_authenticityToken:
            self.logger.warning(
                "An authenticity token was detected but was not persisted; supply credentials through the environment."
            )
