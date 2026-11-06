# Package marker ng test folder.
#
# Bakit kailangan ito: ang pangalang "test" ay may built-in na kapareho sa
# Python standard library (ang stdlib `test` package). Kapag walang
# __init__.py ang local na test folder, ang `python -m unittest
# test.test_chat_score_shortcut` ay tumitingin sa stdlib `test` package at
# hindi sa folder na ito — kaya "No module named
# 'test.test_chat_score_shortcut'" ang error. May __init__.py, mananalo ang
# local na folder dahil nauuna ang project root sa sys.path.