import scrapy
import json
from external_config import load_ifttt_credentials


class IftttTriggerSpider(scrapy.Spider):
    name = "ifttt.com"
    start_urls = ["https://ifttt.com/login"]
    module_name_path = "./data/module_name.json"

    def __init__(self, *args, **kwargs):
        super(IftttTriggerSpider, self).__init__(*args, **kwargs)

        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"

        keys = load_ifttt_credentials()
        self.username = keys["username"]
        self.email = keys["email"]
        self.password = keys["password"]
        self.authorization = keys["authorization"]

        with open(self.module_name_path, "r") as f:
            module_names = json.load(f)
        self.module_name_list = [item["module_name"] for item in module_names]

    def parse(self, response):
        # get authenticity token
        # authenticity_token = response.css(
        #     "input[type=hidden]:nth-child(2)::attr(value)"
        # ).get()

        yield scrapy.FormRequest.from_response(
            response,
            formdata={
                "utf8": "✓",
                # "authenticity_token": authenticity_token,
                "return_to": None,
                "psu_": None,
                "user[username]": self.email,
                "user[password]": self.password,
                "commit": "Log+in",
            },
            headers={"User-Agent": self.user_agent, "Authorization": 'Token jwt="' + self.authorization + '"'},
            callback=self.login_check,
        )

    def login_check(self, response):
        # check if successfully logged in
        if b"The email and password don&#39;t match." in response.body:
            self.logger.error("Login failed: Wrong username or password.")
            return

        self.logger.info("Successfully login.")

        headers = {"Content-Type": "application/json", "User-Agent": self.user_agent,
                   "Authorization": 'Token jwt="' + self.authorization + '"'}

        for module_name in self.module_name_list:
            payload = {
                "query": "\n  query DIYLoadServiceTriggersAndFieldsQuery($serviceModuleName: String!) {\n    channel(module_name: $serviceModuleName) {\n      \n  live_channels {\n    id\n    user_name_field\n    offline\n  }\n\n      public_triggers {\n        module_name\n        full_module_name\n        normalized_module_name\n        name\n        description\n        id\n        weight\n        tier\n\n        trigger_fields {\n          name\n          label\n          required\n          shareable\n          hideable\n          field_ui_type\n          normalized_field_type\n          helper_text\n        }\n\n        ingredients {\n          id\n          name\n          normalized_name\n          label\n          note\n          slug\n          value_type\n          example\n        }\n      }\n    }\n  }\n",
                "variables": {"serviceModuleName": module_name},
            }
            yield scrapy.Request(
                "https://ifttt.com/api/v3/graph",
                method="POST",
                body=json.dumps(payload),
                headers=headers,
                callback=self.get_trigger_by_name,
                meta={"module_name": module_name},
            )

    def get_trigger_by_name(self, response):
        module_name = response.meta["module_name"]
        json_data = response.json()

        with open("./data/trigger_json/" + module_name + ".json", "w") as f:
            json.dump(json_data, f, indent=4)
