"""Optional Selenium adapter for manually exercising a composed IFTTT rule."""

import os
import sys
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

if __package__:
    from .external_config import load_ifttt_credentials
    from .sqlite_interface import SqliteInterface
else:  # Allows direct execution from applet_executor/.
    from external_config import load_ifttt_credentials
    from sqlite_interface import SqliteInterface


class AppletExecutor:
    def __init__(self, infos: dict) -> None:
        self.trigger_device = infos["trigger_device"]
        self.trigger_condition = infos["trigger_condition"]
        self.query_device = infos["query_device"]
        self.query_content = infos["query_content"]
        self.action_device = infos["action_device"]
        self.action_execution = infos["action_execution"]
        self.is_pro = infos["is_pro"]
        self.priority = infos["priority"]

        credentials = load_ifttt_credentials()
        self.email = credentials["email"]
        self.password = credentials["password"]
        self.login_url = os.environ.get("IFTTT_LOGIN_URL", "https://ifttt.com/login")
        self.create_url = os.environ.get("IFTTT_CREATE_URL", "https://ifttt.com/create")

        with SqliteInterface() as store:
            store.add_applet(
                self.trigger_device, self.trigger_condition, self.query_device, self.query_content,
                self.action_device, self.action_execution, self.is_pro, self.priority,
            )

        options = Options()
        options.add_experimental_option("detach", True)
        self.driver = webdriver.Chrome(options=options)

    def login(self):
        self.driver.get(self.login_url)
        username = self.driver.find_element(By.NAME, "user[email]")
        username.clear()
        username.send_keys(self.email)
        password = self.driver.find_element(By.NAME, "user[password]")
        password.clear()
        password.send_keys(self.password)
        self.driver.find_element(By.NAME, "commit").click()

    def click_button(self, text):
        self.driver.find_element(By.XPATH, f"//button[contains(., {text!r})]").click()
        time.sleep(1)

    def click_span(self, text):
        self.driver.find_element(By.XPATH, f"//span[contains(., {text!r})]").click()
        time.sleep(1)

    def execute(self):
        self.driver.get(self.create_url)
        self.click_button("If This")
        self.click_span(self.trigger_device)
        self.click_span(self.trigger_condition)
        self.click_button("Then That")
        self.click_span(self.action_device)
        self.click_span(self.action_execution)
        self.click_button("Continue")
        self.click_button("Finish")
        self.driver.quit()


if __name__ == "__main__":
    if len(sys.argv) != 9:
        raise SystemExit("Expected eight rule arguments; use offline_composer.py for the safe local demo")
    arguments = dict(zip(
        ("trigger_device", "trigger_condition", "query_device", "query_content",
         "action_device", "action_execution", "is_pro", "priority"),
        sys.argv[1:],
    ))
    adapter = AppletExecutor(arguments)
    adapter.login()
    adapter.execute()
